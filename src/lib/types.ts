export interface MergeOptions {
  prefix: string;
  output: string;
  inputs: string[];
  noPrefix: boolean;
  verbose: boolean;
  stripPrefix?: string; // strip this prefix from item names before adding new prefix
}

export interface MergeStats {
  filesProcessed: number;
  sectionsFound: string[];
  totalItems: number;
  conflicts: Array<{ name: string; files: string[] }>;
  renamed: number;
}
