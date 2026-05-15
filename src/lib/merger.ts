import { XMLParser, XMLBuilder } from "fast-xml-parser";
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import type { XmlNode, PtfxItem, PtfxSection, MergeOptions, MergeStats } from "./types.ts";

const ATTR_PREFIX = "@_";
const NAME_ATTR = `${ATTR_PREFIX}name`;

const parserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: ATTR_PREFIX,
  allowBooleanAttributes: true,
  parseAttributeValue: false,  // keep all values as strings
  preserveOrder: true,
  commentPropName: "#comment",
  trimValues: false,
};

const builderOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: ATTR_PREFIX,
  format: true,
  indentBy: "    ",
  preserveOrder: true,
  commentPropName: "#comment",
  suppressEmptyNode: false,
};

const parser = new XMLParser(parserOptions);
const builder = new XMLBuilder(builderOptions);

// ─── helpers ──────────────────────────────────────────────────────────────────

function getTag(node: XmlNode): string {
  return Object.keys(node).find((k) => k !== ":@" && k !== "#comment") ?? "";
}

function getAttr(node: XmlNode, attr: string): string | undefined {
  return node[":@"]?.[attr];
}

function setAttr(node: XmlNode, attr: string, value: string): void {
  if (!node[":@"]) node[":@"] = {};
  node[":@"][attr] = value;
}

function getChildren(node: XmlNode): XmlNode[] {
  const tag = getTag(node);
  if (!tag) return [];
  const val = node[tag];
  if (!Array.isArray(val)) return [];
  return val.filter((c): c is XmlNode => typeof c === "object" && c !== null);
}

// ─── rename logic ─────────────────────────────────────────────────────────────

// Collect every name="..." of direct Item children inside a section
function collectItemNames(sectionNode: XmlNode): Set<string> {
  const names = new Set<string>();
  for (const child of getChildren(sectionNode)) {
    if (getTag(child) === "Item") {
      const name = getAttr(child, NAME_ATTR);
      if (name) names.add(name);
    }
  }
  return names;
}

// Walk every attribute in a node tree; replace matching names with prefixed version
function renameRefs(node: XmlNode, renameMap: Map<string, string>, depth = 0): void {
  if (typeof node !== "object" || node === null || depth > 50) return;
  if (node[":@"]) {
    for (const [attr, val] of Object.entries(node[":@"])) {
      if (typeof val === "string") {
        const mapped = renameMap.get(val);
        if (mapped) node[":@"][attr] = mapped;
      }
    }
  }
  for (const child of getChildren(node)) {
    renameRefs(child, renameMap, depth + 1);
  }
}

// Apply prefix to an item node and return the new name
function prefixItem(itemNode: XmlNode, prefix: string, renameMap: Map<string, string>): string {
  const original = getAttr(itemNode, NAME_ATTR) ?? "";
  const newName = renameMap.get(original) ?? original;
  setAttr(itemNode, NAME_ATTR, newName);
  return newName;
}

// ─── parse one file ───────────────────────────────────────────────────────────

interface ParsedFile {
  xmlDecl: XmlNode | null;      // <?xml ...?>
  rootTag: string;              // ParticleEffectsList
  sections: Map<string, PtfxSection>;
  sectionOrder: string[];       // preserve section order from first file
  filename: string;
}

function parseFile(filepath: string): ParsedFile {
  const raw = readFileSync(filepath, "utf-8");
  const nodes: XmlNode[] = parser.parse(raw);

  let xmlDecl: XmlNode | null = null;
  let rootNode: XmlNode | null = null;

  for (const node of nodes) {
    const tag = getTag(node);
    if (tag === "?xml") { xmlDecl = node; continue; }
    if (tag && tag !== "#comment") { rootNode = node; break; }
  }

  if (!rootNode) throw new Error(`No root element found in ${filepath}`);

  const rootTag = getTag(rootNode);
  const sections = new Map<string, PtfxSection>();
  const sectionOrder: string[] = [];

  for (const sectionNode of getChildren(rootNode)) {
    const sTag = getTag(sectionNode);
    if (!sTag || sTag === "#comment" || sTag === "#text") continue;

    const items: PtfxItem[] = [];
    const extra: XmlNode[] = [];

    for (const child of getChildren(sectionNode)) {
      if (getTag(child) === "Item" && getAttr(child, NAME_ATTR)) {
        items.push({
          name: getAttr(child, NAME_ATTR)!,
          node: child,
          sourceFile: filepath,
        });
      } else {
        extra.push(child);
      }
    }

    if (!sections.has(sTag)) {
      sections.set(sTag, { tag: sTag, items: [], extra });
      sectionOrder.push(sTag);
    }

    const existing = sections.get(sTag)!;
    existing.items.push(...items);
    // merge extras (deduplicate by string repr)
    for (const e of extra) {
      if (!existing.extra.some((x) => JSON.stringify(x) === JSON.stringify(e))) {
        existing.extra.push(e);
      }
    }
  }

  return { xmlDecl, rootTag, sections, sectionOrder, filename: filepath };
}

// ─── main merge ───────────────────────────────────────────────────────────────

export function merge(opts: MergeOptions): MergeStats {
  if (opts.inputs.length === 0) throw new Error("No input files provided");

  const stats: MergeStats = {
    filesProcessed: 0,
    sectionsFound: [],
    totalItems: 0,
    conflicts: [],
    renamed: 0,
  };

  // Parse all files
  const parsed = opts.inputs.map((f) => {
    if (opts.verbose) console.log(`  Parsing: ${f}`);
    const result = parseFile(f);
    stats.filesProcessed++;
    return result;
  });

  const firstFile = parsed[0];

  // ── Step 1: build full rename map across ALL files BEFORE modifying nodes
  //    so internal cross-references resolve correctly
  const renameMap = new Map<string, string>(); // original → prefixed

  if (!opts.noPrefix && opts.prefix) {
    for (const pf of parsed) {
      for (const section of pf.sections.values()) {
        for (const item of section.items) {
          if (!renameMap.has(item.name)) {
            renameMap.set(item.name, opts.prefix + item.name);
          }
        }
      }
    }
    stats.renamed = renameMap.size;
  }

  // ── Step 2: detect conflicts (same name from different files, no prefix)
  if (opts.noPrefix || !opts.prefix) {
    const seen = new Map<string, string>(); // name → first filename
    for (const pf of parsed) {
      for (const section of pf.sections.values()) {
        for (const item of section.items) {
          if (seen.has(item.name)) {
            const existing = stats.conflicts.find((c) => c.name === item.name);
            if (existing) {
              if (!existing.files.includes(item.sourceFile)) existing.files.push(item.sourceFile);
            } else {
              stats.conflicts.push({ name: item.name, files: [seen.get(item.name)!, item.sourceFile] });
            }
          } else {
            seen.set(item.name, item.sourceFile);
          }
        }
      }
    }
  }

  // ── Step 3: merge sections
  const mergedSections = new Map<string, PtfxSection>();
  const sectionOrder: string[] = firstFile.sectionOrder;

  // ensure all section tags are in order (add new ones from other files at end)
  for (const pf of parsed) {
    for (const tag of pf.sectionOrder) {
      if (!sectionOrder.includes(tag)) sectionOrder.push(tag);
    }
  }

  for (const tag of sectionOrder) {
    mergedSections.set(tag, { tag, items: [], extra: [] });
  }

  for (const pf of parsed) {
    for (const [tag, section] of pf.sections) {
      const merged = mergedSections.get(tag)!;

      // Apply prefix and internal ref renames to each item
      for (const item of section.items) {
        if (renameMap.size > 0) {
          prefixItem(item.node, opts.prefix, renameMap);
          renameRefs(item.node, renameMap);
          item.name = renameMap.get(item.name) ?? item.name;
        }
        merged.items.push(item);
        stats.totalItems++;
      }

      // Merge extras
      for (const e of section.extra) {
        if (!merged.extra.some((x) => JSON.stringify(x) === JSON.stringify(e))) {
          merged.extra.push(e);
        }
      }
    }
  }

  stats.sectionsFound = [...mergedSections.keys()];

  // ── Step 4: build output XML nodes
  const rootChildren: XmlNode[] = [];

  for (const tag of sectionOrder) {
    const section = mergedSections.get(tag);
    if (!section) continue;

    const itemNodes: XmlNode[] = [
      ...section.extra,
      ...section.items.map((i) => i.node),
    ];

    const sectionNode: XmlNode = { [tag]: itemNodes };
    rootChildren.push(sectionNode);
  }

  const rootNode: XmlNode = { [firstFile.rootTag]: rootChildren };

  const outputNodes: XmlNode[] = [];
  if (firstFile.xmlDecl) outputNodes.push(firstFile.xmlDecl);
  outputNodes.push(rootNode);

  const xmlOut = builder.build(outputNodes) as string;

  // Write output
  const outDir = opts.output.split(/[\\/]/).slice(0, -1).join("/");
  if (outDir) mkdirSync(outDir, { recursive: true });
  writeFileSync(opts.output, xmlOut, "utf-8");

  return stats;
}
