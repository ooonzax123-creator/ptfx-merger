export interface MergeOptions {
  prefix: string;
  output: string;
  inputs: string[];
  noPrefix: boolean;
  verbose: boolean;
}

export interface MergeStats {
  filesProcessed: number;
  sectionsFound: string[];
  totalItems: number;
  conflicts: Array<{ name: string; files: string[] }>;
  renamed: number;
}
