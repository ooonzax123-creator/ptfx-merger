#!/usr/bin/env bun
/**
 * ptfx-merger — รวม GTA V .ypt XML files หลายไฟล์เป็น dictionary เดียว
 *
 * Usage:
 *   bun src/merge.ts --prefix lee_ --output output/lee_core.ypt.xml a.ypt.xml b.ypt.xml
 *   bun src/merge.ts --no-prefix --output merged.ypt.xml a.ypt.xml b.ypt.xml
 */

import { parseArgs } from "util";
import { existsSync } from "fs";
import { resolve, basename } from "path";
import { merge } from "./lib/merger.ts";
import type { MergeOptions } from "./lib/types.ts";

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    prefix:    { type: "string",  short: "p", default: "" },
    output:    { type: "string",  short: "o", default: "output/merged.ypt.xml" },
    "no-prefix": { type: "boolean", default: false },
    verbose:   { type: "boolean", short: "v", default: false },
    help:      { type: "boolean", short: "h", default: false },
  },
  allowPositionals: true,
});

// ─── Help ─────────────────────────────────────────────────────────────────────

if (values.help || positionals.length === 0) {
  console.log(`
ptfx-merger — รวม GTA V .ypt XML files เป็น custom particle dictionary

Usage:
  bun src/merge.ts [options] file1.ypt.xml file2.ypt.xml ...

Options:
  --prefix,    -p   Prefix ที่จะเติมหน้าชื่อ effect ทุกตัว (แนะนำ: ชื่อย่อ project)
  --output,    -o   ไฟล์ output (default: output/merged.ypt.xml)
  --no-prefix       Merge โดยไม่เติม prefix (จะเตือนถ้า name ซ้ำ)
  --verbose,   -v   แสดง log ละเอียด
  --help,      -h   แสดง help นี้

Examples:
  # รวม 2 project ด้วย prefix "lee_"
  bun src/merge.ts -p lee_ -o output/lee_core.ypt.xml projectA.ypt.xml projectB.ypt.xml

  # รวมโดยไม่เติม prefix (ชื่อ effect ต้องไม่ซ้ำกัน)
  bun src/merge.ts --no-prefix -o merged.ypt.xml a.ypt.xml b.ypt.xml

  # ใช้ใน script หลัง merge:
  #   RequestNamedPtfxAsset("lee_core")
  #   UseParticleFxAssetNextCall("lee_core")
  #   StartParticleFxNonLoopedAtCoord("lee_my_effect", ...)
  `);
  process.exit(0);
}

// ─── Validate inputs ─────────────────────────────────────────────────────────

const inputs = positionals.map((f) => resolve(f));
const missing = inputs.filter((f) => !existsSync(f));
if (missing.length > 0) {
  console.error(`\n❌ ไม่พบไฟล์:\n${missing.map((f) => `   ${f}`).join("\n")}\n`);
  process.exit(1);
}

const noPrefix = values["no-prefix"] as boolean;
const prefix = noPrefix ? "" : (values.prefix as string);

if (!noPrefix && !prefix) {
  console.warn(`\n⚠️  ไม่มี --prefix — แนะนำใช้ --prefix ชื่อ_project_ เพื่อป้องกันชื่อชน`);
  console.warn(`   หรือใช้ --no-prefix ถ้าชื่อ effect ทุกไฟล์ไม่ซ้ำกัน\n`);
}

// ─── Run ──────────────────────────────────────────────────────────────────────

const opts: MergeOptions = {
  prefix,
  output: resolve(values.output as string),
  inputs,
  noPrefix,
  verbose: values.verbose as boolean,
};

console.log(`\n🔧 ptfx-merger`);
console.log(`   Files : ${inputs.map((f) => basename(f)).join(", ")}`);
console.log(`   Prefix: ${prefix || "(none)"}`);
console.log(`   Output: ${opts.output}\n`);

try {
  const stats = merge(opts);

  console.log(`✅ Done!\n`);
  console.log(`   Files processed : ${stats.filesProcessed}`);
  console.log(`   Sections found  : ${stats.sectionsFound.join(", ")}`);
  console.log(`   Total items     : ${stats.totalItems}`);
  if (stats.renamed > 0) {
    console.log(`   Renamed (prefix): ${stats.renamed}`);
  }

  if (stats.conflicts.length > 0) {
    console.warn(`\n⚠️  Name conflicts (${stats.conflicts.length}):`);
    for (const c of stats.conflicts) {
      console.warn(`   "${c.name}" ← ${c.files.map(basename).join(", ")}`);
    }
    console.warn(`   แนะนำใช้ --prefix เพื่อแก้ปัญหานี้\n`);
  }

  console.log(`\n📦 Output: ${opts.output}`);
  console.log(`\n💡 วิธีใช้ใน Lua:`);
  const assetName = basename(opts.output).replace(/\.ypt\.xml$|\.xml$/, "");
  console.log(`   RequestNamedPtfxAsset("${assetName}")`);
  console.log(`   UseParticleFxAssetNextCall("${assetName}")`);
  console.log(`   StartParticleFxNonLoopedAtCoord("${prefix}your_effect_name", ...)\n`);

} catch (err) {
  console.error(`\n❌ Error:`, err instanceof Error ? err.message : err);
  process.exit(1);
}
