export interface ExtractionOptions {
  targetDir: string;
  /** Lowercase extensions with the dot, e.g. ".vpk"; omit to extract everything */
  fileExtensions?: string[];
}

export interface ExtractionResult {
  extractedFiles: string[];
  errors: Array<{ file: string; error: string }>;
  totalBytes: number;
}

export interface TempDirResult {
  path: string;
  cleanup: () => Promise<void>;
  [Symbol.asyncDispose]: () => Promise<void>;
}
