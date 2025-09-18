import { createHash } from 'node:crypto';
import { ValidationError } from '@deadlock-mods/common';
import xxhash from 'xxhash-wasm';
import type {
  MerkleData,
  VpkEntry,
  VpkFingerprint,
  VpkHeader,
  VpkParsed,
  VpkParseOptions,
} from './types';

const VPK_SIGNATURE = 0x55_aa_12_34;

export class VpkParser {
  private buffer: Buffer;
  private view: DataView;
  private cursor = 0;

  constructor(buffer: Buffer) {
    this.buffer = buffer;
    this.view = new DataView(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength
    );
  }

  static async parse(
    vpkBuffer: Buffer,
    options: VpkParseOptions = {}
  ): Promise<VpkParsed> {
    const parser = new VpkParser(vpkBuffer);
    return await parser.parseInternal(options);
  }

  private async parseInternal(options: VpkParseOptions): Promise<VpkParsed> {
    const {
      includeFullFileHash = false,
      filePath = '',
      lastModified,
      includeMerkle = false,
    } = options;

    const header = this.parseHeader();
    const treeStart = this.cursor;
    const entries = this.parseDirectoryTree(treeStart, header.treeLength);
    const manifestSha256 = this.generateManifestHash(entries);
    const dirSha256 = includeFullFileHash
      ? createHash('sha256').update(this.buffer).digest('hex')
      : undefined;
    const fingerprint = await this.generateFingerprint(
      entries,
      filePath,
      lastModified,
      includeMerkle
    );

    return {
      version: header.version,
      treeLength: header.treeLength,
      fileDataSectionSize: header.fileDataSectionSize,
      archiveMD5SectionSize: header.archiveMD5SectionSize,
      otherMD5SectionSize: header.otherMD5SectionSize,
      signatureSectionSize: header.signatureSectionSize,
      entries,
      manifestSha256,
      dirSha256,
      fingerprint,
    };
  }

  private parseHeader(): VpkHeader {
    if (this.buffer.length < 12) {
      throw new Error('Buffer too small for VPK header');
    }

    const signature = this.readUint32();
    if (signature !== VPK_SIGNATURE) {
      throw new ValidationError(
        `Not a VPK: 0x${signature.toString(16).padStart(8, '0')}`
      );
    }

    const version = this.readUint32();
    const treeLength = this.readUint32();

    let fileDataSectionSize: number | undefined;
    let archiveMD5SectionSize: number | undefined;
    let otherMD5SectionSize: number | undefined;
    let signatureSectionSize: number | undefined;

    if (version >= 2) {
      if (this.buffer.length < 28) {
        throw new Error('Buffer too small for VPK v2 header');
      }

      fileDataSectionSize = this.readUint32();
      archiveMD5SectionSize = this.readUint32();
      otherMD5SectionSize = this.readUint32();
      signatureSectionSize = this.readUint32();
    }

    return {
      version,
      treeLength,
      fileDataSectionSize,
      archiveMD5SectionSize,
      otherMD5SectionSize,
      signatureSectionSize,
    };
  }

  private parseDirectoryTree(
    treeStart: number,
    treeLength: number
  ): VpkEntry[] {
    const entries: VpkEntry[] = [];
    const treeEnd = treeStart + treeLength;

    while (this.cursor < treeEnd) {
      const ext = this.readNullTerminatedString();
      if (ext === '') {
        break; // End of tree
      }

      while (this.cursor < treeEnd) {
        const path = this.readNullTerminatedString();
        if (path === '') {
          break; // End of paths for this extension
        }

        while (this.cursor < treeEnd) {
          const filename = this.readNullTerminatedString();
          if (filename === '') {
            break; // End of filenames for this path
          }

          const entry = this.parseEntry(ext, path, filename);
          entries.push(entry);
          if (entry.preloadBytes > 0) {
            this.cursor += entry.preloadBytes;
            if (this.cursor > this.buffer.length) {
              throw new Error('Cursor overrun reading preload data');
            }
          }
        }
      }
    }

    return entries;
  }

  private parseEntry(ext: string, path: string, filename: string): VpkEntry {
    if (this.cursor + 18 > this.buffer.length) {
      throw new Error('Cursor overrun reading entry structure');
    }

    const crc32 = this.readUint32();
    const preloadBytes = this.readUint16();
    const archiveIndex = this.readUint16();
    const entryOffset = this.readUint32();
    const entryLength = this.readUint32();
    const terminator = this.readUint16();

    if (terminator !== 0xff_ff) {
      // Expected terminator 0xFFFF, got different value - warning only
    }

    const normalizedPath = path === ' ' ? '' : path;
    const pathParts = [normalizedPath, `${filename}.${ext}`].filter(Boolean);
    const fullPath = pathParts.join('/');

    return {
      fullPath,
      path: normalizedPath,
      filename,
      ext,
      crc32Hex: crc32.toString(16).padStart(8, '0').toLowerCase(),
      preloadBytes,
      archiveIndex,
      entryOffset,
      entryLength,
      terminator,
    };
  }

  private generateManifestHash(entries: VpkEntry[]): string {
    const lines = entries.map(
      (entry) => `${entry.fullPath.toLowerCase()}\x00${entry.crc32Hex}\n`
    );
    lines.sort();
    const manifestContent = lines.join('');
    return createHash('sha256').update(manifestContent, 'utf8').digest('hex');
  }

  /**
   * Generate enhanced fingerprint for better mod identification
   */
  private async generateFingerprint(
    entries: VpkEntry[],
    filePath: string,
    lastModified?: Date,
    includeMerkle = false
  ): Promise<VpkFingerprint> {
    // Detect VPK characteristics
    const hasMultiparts = this.detectMultiparts(entries);
    const hasInlineData = this.detectInlineData(entries);

    // 1. Fast hash (xxHash64) of entire buffer
    const { h64ToString } = await xxhash();
    const fastHash = h64ToString(this.buffer.toString('hex'), BigInt(0));

    // 2. Strong hash (SHA-256) of entire buffer
    const sha256 = createHash('sha256').update(this.buffer).digest('hex');

    // 3. Content signature based on VPK structure
    const contentSignature = this.generateContentSignature(entries);

    // 4. Optional Merkle hash for near-duplicate detection
    let merkleRoot: string | undefined;
    let merkleLeaves: string[] | undefined;

    if (includeMerkle) {
      const merkleData = this.generateMerkleHash(entries);
      merkleRoot = merkleData.root;
      merkleLeaves = merkleData.leaves;
    }

    return {
      filePath,
      fileSize: this.buffer.length,
      lastModified,
      fastHash,
      sha256,
      contentSignature,
      vpkVersion: this.getVpkVersion(),
      fileCount: entries.length,
      hasMultiparts,
      hasInlineData,
      merkleRoot,
      merkleLeaves,
    };
  }

  /**
   * Generate content signature based on VPK structure
   * This stays the same even if the VPK is repackaged or renamed
   */
  private generateContentSignature(entries: VpkEntry[]): string {
    // Filter out known junk files that shouldn't affect content identity
    const junkFiles = new Set([
      'thumbs.db',
      '.ds_store',
      'desktop.ini',
      '.tmp',
      '.temp',
    ]);

    const filteredEntries = entries.filter((entry) => {
      const fileName = entry.filename.toLowerCase();
      const fullPath = entry.fullPath.toLowerCase();
      if (junkFiles.has(fileName)) {
        return false;
      }
      return !Array.from(junkFiles).some((junk) => fullPath.includes(junk));
    });

    // Build canonical tuples: (normalized_path, size, crc32)
    const tuples = filteredEntries.map((entry) => {
      // Normalize path: lowercase, forward slashes
      const normalizedPath = entry.fullPath.toLowerCase().replace(/\\/g, '/');
      return `${normalizedPath}\x00${entry.entryLength}\x00${entry.crc32Hex}`;
    });

    // Sort tuples for deterministic output
    tuples.sort();

    // Hash the sorted list
    const content = tuples.join('\n');
    return createHash('sha256').update(content, 'utf8').digest('hex');
  }

  /**
   * Generate Merkle hash for near-duplicate detection
   */
  private generateMerkleHash(entries: VpkEntry[]): MerkleData {
    // Generate per-file hashes (leaves)
    const leaves = entries.map((entry) => {
      // Hash the entry metadata: path + size + crc32
      const entryData = `${entry.fullPath}|${entry.entryLength}|${entry.crc32Hex}`;
      return createHash('sha256').update(entryData, 'utf8').digest('hex');
    });

    // Sort leaves for deterministic Merkle tree
    const sortedLeaves = [...leaves].sort();

    // Build Merkle tree (simple approach: hash all leaves together)
    // For a more sophisticated implementation, you'd build a proper binary tree
    const merkleContent = sortedLeaves.join('');
    const root = createHash('sha256')
      .update(merkleContent, 'utf8')
      .digest('hex');

    return { root, leaves };
  }

  /**
   * Get the VPK version from the parsed header
   */
  private getVpkVersion(): number {
    // We need to store the version from the header parsing
    // For now, let's re-read it from the buffer
    if (this.buffer.length < 8) {
      return 1;
    }
    const view = new DataView(
      this.buffer.buffer,
      this.buffer.byteOffset,
      this.buffer.byteLength
    );
    return view.getUint32(4, true); // Version is at offset 4
  }

  /**
   * Detect if VPK has multipart archives (e.g., _000.vpk, _001.vpk files)
   */
  private detectMultiparts(entries: VpkEntry[]): boolean {
    // Check if any entries reference archive indices > 0x7fff (indicates multipart)
    return entries.some(
      (entry) => entry.archiveIndex !== 0x7f_ff && entry.archiveIndex > 0
    );
  }

  /**
   * Detect if VPK has inline data (small files stored directly in the directory)
   */
  private detectInlineData(entries: VpkEntry[]): boolean {
    // Check if any entries have preload bytes (inline data)
    return entries.some((entry) => entry.preloadBytes > 0);
  }

  private readUint32(): number {
    if (this.cursor + 4 > this.buffer.length) {
      throw new Error('Cursor overrun reading uint32');
    }
    const value = this.view.getUint32(this.cursor, true); // little-endian
    this.cursor += 4;
    return value;
  }

  private readUint16(): number {
    if (this.cursor + 2 > this.buffer.length) {
      throw new Error('Cursor overrun reading uint16');
    }
    const value = this.view.getUint16(this.cursor, true); // little-endian
    this.cursor += 2;
    return value;
  }

  private readNullTerminatedString(): string {
    const start = this.cursor;

    // Find null terminator
    while (this.cursor < this.buffer.length && this.buffer[this.cursor] !== 0) {
      this.cursor++;
    }

    if (this.cursor >= this.buffer.length) {
      throw new Error('Cursor overrun reading null-terminated string');
    }

    // Extract string bytes
    const stringBytes = this.buffer.subarray(start, this.cursor);
    this.cursor++; // Skip null terminator

    // Try UTF-8 first, fallback to latin1
    try {
      return stringBytes.toString('utf8');
    } catch {
      return stringBytes.toString('latin1');
    }
  }
}
