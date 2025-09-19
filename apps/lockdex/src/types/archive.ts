import type { Readable } from "node:stream";

export interface ArchiveEntry {
  path: string;
  size: number;
  isDirectory: boolean;
  modifiedAt?: Date;
  compressionRatio?: number;
}

export interface ExtractionOptions {
  targetDir: string;
  preservePaths?: boolean;
  fileExtensions?: string[];
  maxFileSize?: number;
  overwrite?: boolean;
}

export interface ExtractionResult {
  extractedFiles: string[];
  skippedFiles: string[];
  errors: Array<{ file: string; error: string }>;
  totalBytes: number;
}

export interface StreamExtractionResult {
  stream: Readable;
  entry: ArchiveEntry;
}

export interface TempDirResult {
  path: string;
  cleanup: () => Promise<void>;
  [Symbol.asyncDispose]: () => Promise<void>;
}
