/**
 * Real CodeWalker .ypt.xml format:
 *
 * <ParticleEffectsList>
 *   <Name>asset_name</Name>
 *   <EffectRuleDictionary>
 *     <Item><Name>effect_name</Name>...</Item>
 *   </EffectRuleDictionary>
 *   <EmitterRuleDictionary>
 *     <Item><Name>emitter_name</Name>...</Item>
 *   </EmitterRuleDictionary>
 *   <ParticleRuleDictionary>
 *     <Item><Name>particle_name</Name>...</Item>
 *   </ParticleRuleDictionary>
 *   <DrawableDictionary>...</DrawableDictionary>
 *   <TextureDictionary>...</TextureDictionary>
 * </ParticleEffectsList>
 *
 * References inside items use TEXT CONTENT, not attributes:
 *   <EmitterRule>emitter_name</EmitterRule>
 *   <ParticleRule>particle_name</ParticleRule>
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { basename, dirname } from "path";
import type { MergeOptions, MergeStats } from "./types.ts";

// All dictionary section tags in a .ypt.xml file
const DICT_TAGS = [
  "EffectRuleDictionary",
  "EmitterRuleDictionary",
  "ParticleRuleDictionary",
  "DrawableDictionary",
  "TextureDictionary",
] as const;

// Tags whose TEXT CONTENT references item names (need to be updated on rename)
const REF_TAGS = ["EmitterRule", "ParticleRule", "EffectRule"];

// ─── XML text utilities ───────────────────────────────────────────────────────

/** Extract text content of first matching tag: <tag>content</tag> */
function extractTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`);
  const m = xml.match(re);
  return m ? m[1] : null;
}

/** Extract inner content of a section (everything inside <tag>...</tag>) */
function extractSection(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`);
  const m = xml.match(re);
  return m ? m[1] : "";
}

/** Get all item names (first <Name> of each top-level <Item>) in a dictionary section */
function extractItemNamesFromSection(sectionContent: string): string[] {
  const names: string[] = [];
  // Match each top-level <Item> block with proper depth tracking
  const items = extractTopLevelItems(sectionContent);
  for (const item of items) {
    const name = extractTag(item, "Name");
    if (name && name.trim() && !name.includes(":")) {
      // Skip property names like "ptxCreationDomain:m_positionKFP"
      names.push(name.trim());
    }
  }
  return names;
}

/** Extract top-level <Item>...</Item> blocks from a section (depth-aware) */
function extractTopLevelItems(content: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let start = -1;
  let i = 0;

  while (i < content.length) {
    if (content.startsWith("<Item>", i) || content.startsWith("<Item\n", i) || content.startsWith("<Item ", i)) {
      if (depth === 0) start = i;
      depth++;
      i += 5;
    } else if (content.startsWith("</Item>", i)) {
      depth--;
      i += 7;
      if (depth === 0 && start !== -1) {
        items.push(content.slice(start, i));
        start = -1;
      }
    } else {
      i++;
    }
  }

  return items;
}

// ─── Rename logic ─────────────────────────────────────────────────────────────

/** Apply prefix rename map to XML text — updates <Name> and all ref tags */
function applyRenameMap(xml: string, renameMap: Map<string, string>): string {
  if (renameMap.size === 0) return xml;

  let result = xml;

  for (const [original, renamed] of renameMap) {
    // Escape for regex
    const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // 1. Update <Name>original</Name>
    result = result.replace(
      new RegExp(`(<Name>\\s*)${escaped}(\\s*<\\/Name>)`, "g"),
      `$1${renamed}$2`
    );

    // 2. Update reference tags: <EmitterRule>, <ParticleRule>, <EffectRule>
    for (const refTag of REF_TAGS) {
      result = result.replace(
        new RegExp(`(<${refTag}>\\s*)${escaped}(\\s*<\\/${refTag}>)`, "g"),
        `$1${renamed}$2`
      );
    }
  }

  return result;
}

// ─── Parse one file ───────────────────────────────────────────────────────────

interface ParsedFile {
  filename: string;
  assetName: string;
  xmlRaw: string; // original XML text
  itemNames: Map<string, string[]>; // dictTag → item names
}

function parseFile(filepath: string): ParsedFile {
  const xmlRaw = readFileSync(filepath, "utf-8");
  const assetName = extractTag(xmlRaw, "Name")?.trim() ?? basename(filepath, ".ypt.xml");

  const itemNames = new Map<string, string[]>();
  for (const dictTag of DICT_TAGS) {
    const section = extractSection(xmlRaw, dictTag);
    if (section.trim()) {
      itemNames.set(dictTag, extractItemNamesFromSection(section));
    }
  }

  return { filename: filepath, assetName, xmlRaw, itemNames };
}

// ─── Main merge ───────────────────────────────────────────────────────────────

export function merge(opts: MergeOptions): MergeStats {
  if (opts.inputs.length === 0) throw new Error("No input files provided");

  const stats: MergeStats = {
    filesProcessed: 0,
    sectionsFound: [],
    totalItems: 0,
    conflicts: [],
    renamed: 0,
  };

  // ── Step 1: Parse all files
  const parsed = opts.inputs.map((f) => {
    if (opts.verbose) console.log(`  Parsing: ${f}`);
    const result = parseFile(f);
    stats.filesProcessed++;
    return result;
  });

  // ── Step 2: Build rename maps per file (only rename items DEFINED in that file)
  const renamedXmls: string[] = [];
  const seenNames = new Map<string, string>(); // name → first file

  for (const pf of parsed) {
    // Build rename map for this file's item names only
    const renameMap = new Map<string, string>();

    for (const [dictTag, names] of pf.itemNames) {
      for (const name of names) {
        stats.totalItems++;

        // Conflict detection (before prefix)
        if (!opts.noPrefix && !opts.prefix) {
          if (seenNames.has(name)) {
            const existing = stats.conflicts.find((c) => c.name === name);
            if (existing) {
              if (!existing.files.includes(pf.filename)) existing.files.push(pf.filename);
            } else {
              stats.conflicts.push({ name, files: [seenNames.get(name)!, pf.filename] });
            }
          } else {
            seenNames.set(name, pf.filename);
          }
        }

        if (opts.prefix && !opts.noPrefix) {
          renameMap.set(name, opts.prefix + name);
          stats.renamed++;
        }
      }
    }

    // Apply rename to this file's XML
    renamedXmls.push(applyRenameMap(pf.xmlRaw, renameMap));
  }

  // ── Step 3: Merge sections
  const mergedSections = new Map<string, string>(); // dictTag → combined inner content

  for (const dictTag of DICT_TAGS) {
    const parts: string[] = [];
    for (const xml of renamedXmls) {
      const inner = extractSection(xml, dictTag).trim();
      if (inner) parts.push(inner);
    }
    if (parts.length > 0) {
      mergedSections.set(dictTag, parts.join("\n"));
      if (!stats.sectionsFound.includes(dictTag)) stats.sectionsFound.push(dictTag);
    }
  }

  // ── Step 4: Build output XML
  const outputAssetName = basename(opts.output, ".xml").replace(/\.ypt$/, "");
  const lines: string[] = [];

  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(`<ParticleEffectsList>`);
  lines.push(` <Name>${outputAssetName}</Name>`);

  for (const dictTag of DICT_TAGS) {
    const inner = mergedSections.get(dictTag);
    lines.push(` <${dictTag}>`);
    if (inner) lines.push(inner);
    lines.push(` </${dictTag}>`);
  }

  lines.push(`</ParticleEffectsList>`);

  const xmlOut = lines.join("\n");

  // ── Write output
  const outDir = dirname(opts.output);
  if (outDir && outDir !== ".") mkdirSync(outDir, { recursive: true });
  writeFileSync(opts.output, xmlOut, "utf-8");

  return stats;
}

/** Merge and return XML string directly (for web server, no file write) */
export function mergeToString(opts: Omit<MergeOptions, "output"> & { outputName: string }): {
  xml: string;
  stats: MergeStats;
} {
  const stats: MergeStats = {
    filesProcessed: 0,
    sectionsFound: [],
    totalItems: 0,
    conflicts: [],
    renamed: 0,
  };

  const parsed = opts.inputs.map((f) => {
    const result = parseFile(f);
    stats.filesProcessed++;
    return result;
  });

  const renamedXmls: string[] = [];

  for (const pf of parsed) {
    const renameMap = new Map<string, string>();
    for (const [, names] of pf.itemNames) {
      for (const name of names) {
        stats.totalItems++;
        if (opts.prefix && !opts.noPrefix) {
          renameMap.set(name, opts.prefix + name);
          stats.renamed++;
        }
      }
    }
    renamedXmls.push(applyRenameMap(pf.xmlRaw, renameMap));
  }

  const mergedSections = new Map<string, string>();
  for (const dictTag of DICT_TAGS) {
    const parts: string[] = [];
    for (const xml of renamedXmls) {
      const inner = extractSection(xml, dictTag).trim();
      if (inner) parts.push(inner);
    }
    if (parts.length > 0) {
      mergedSections.set(dictTag, parts.join("\n"));
      stats.sectionsFound.push(dictTag);
    }
  }

  const lines: string[] = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(`<ParticleEffectsList>`);
  lines.push(` <Name>${opts.outputName}</Name>`);
  for (const dictTag of DICT_TAGS) {
    const inner = mergedSections.get(dictTag);
    lines.push(` <${dictTag}>`);
    if (inner) lines.push(inner);
    lines.push(` </${dictTag}>`);
  }
  lines.push(`</ParticleEffectsList>`);

  return { xml: lines.join("\n"), stats };
}
