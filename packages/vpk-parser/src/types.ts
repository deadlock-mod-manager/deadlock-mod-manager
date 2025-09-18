export type VpkEntry = {
  fullPath: string;
  path: string;
  filename: string;
  ext: string;
  crc32Hex: string;
  preloadBytes: number;
  archiveIndex: number;
  entryOffset: number;
  entryLength: number;
  terminator: number;
};

export type VpkFingerprint = {
  filePath: string;
  fileSize: number;
  lastModified?: Date;
  fastHash: string; // xxHash64
  sha256: string;
  contentSignature: string; // SHA-256 of sorted (path, size, crc32) tuples
  vpkVersion: number;
  fileCount: number;
  hasMultiparts: boolean;
  hasInlineData: boolean;
  merkleRoot?: string;
  merkleLeaves?: string[];
};

export type VpkParsed = {
  version: number;
  treeLength: number;
  fileDataSectionSize?: number;
  archiveMD5SectionSize?: number;
  otherMD5SectionSize?: number;
  signatureSectionSize?: number;
  entries: VpkEntry[];
  manifestSha256: string;
  dirSha256?: string;
  fingerprint: VpkFingerprint;
};

export type VpkParseOptions = {
  includeFullFileHash?: boolean;
  filePath?: string;
  lastModified?: Date;
  includeMerkle?: boolean;
};

export type VpkStreamParseOptions = VpkParseOptions & {
  onProgress?: (progress: number) => void; // Progress callback (0-100)
  chunkSize?: number; // Chunk size for streaming (default: 64KB)
};

export type VpkHeader = {
  version: number;
  treeLength: number;
  fileDataSectionSize?: number;
  archiveMD5SectionSize?: number;
  otherMD5SectionSize?: number;
  signatureSectionSize?: number;
};

export type MerkleData = {
  root: string;
  leaves: string[];
};
