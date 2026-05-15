// fast-xml-parser preserveOrder:true node format
export type XmlAttr = { [key: string]: string };

export interface XmlNode {
  [tagName: string]: XmlNode[];
  ":@"?: XmlAttr;
}

// One Item inside a dictionary section
export interface PtfxItem {
  name: string;        // original name="..."
  node: XmlNode;       // full parsed node (mutable)
  sourceFile: string;  // which file this came from
}

// One dictionary section (e.g. EffectRules, ParticleRules, EmitterRules)
export interface PtfxSection {
  tag: string;                // element tag name
  items: PtfxItem[];
  extra: XmlNode[];           // non-Item children (preserve them)
}

export interface MergeOptions {
  prefix: string;             // e.g. "lee_" — applied to all item names
  output: string;             // output file path
  inputs: string[];           // input .ypt.xml file paths
  noPrefix: boolean;          // skip prefix (just merge)
  verbose: boolean;
}

export interface MergeStats {
  filesProcessed: number;
  sectionsFound: string[];
  totalItems: number;
  conflicts: Array<{ name: string; files: string[] }>;
  renamed: number;
}
