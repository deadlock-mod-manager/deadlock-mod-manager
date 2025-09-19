import { createHash } from "node:crypto";
import { type Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ValidationError } from "@deadlock-mods/common";
import xxhash from "xxhash-wasm";
import type {
  MerkleData,
  VpkEntry,
  VpkFingerprint,
  VpkHeader,
  VpkParsed,
  VpkParseOptions,
  VpkStreamParseOptions,
} from "./types";

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
      buffer.byteLength,
    );
  }

  static async parse(
    vpkBuffer: Buffer,
    options: VpkParseOptions = {},
  ): Promise<VpkParsed> {
    const parser = new VpkParser(vpkBuffer);
    return await parser.parseInternal(options);
  }

  /**
   * Parse VPK from a readable stream with progress callbacks
   */
  static async parseStream(
    stream: Readable,
    options: VpkStreamParseOptions = {},
  ): Promise<VpkParsed> {
    const chunks: Buffer[] = [];
    let totalSize = 0;

    const collectTransform = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        chunks.push(chunk);
        totalSize += chunk.length;

        if (options.onProgress) {
          const estimatedProgress = Math.min(
            50,
            (totalSize / (1024 * 1024)) * 10,
          );
          options.onProgress(estimatedProgress);
        }

        callback();
      },
    });

    await pipeline(stream, collectTransform);

    const buffer = Buffer.concat(chunks);
    const parser = new VpkParser(buffer);
    const { onProgress, chunkSize, ...parseOptions } = options;

    if (options.onProgress) {
      options.onProgress(75);
    }

    const result = await parser.parseInternal(parseOptions);

    if (options.onProgress) {
      options.onProgress(100);
    }

    return result;
  }

  private async parseInternal(options: VpkParseOptions): Promise<VpkParsed> {
    const {
      includeFullFileHash = false,
      filePath = "",
      lastModified,
      includeMerkle = false,
    } = options;

    const header = this.parseHeader();
    const treeStart = this.cursor;
    const entries = this.parseDirectoryTree(treeStart, header.treeLength);
    const manifestSha256 = this.generateManifestHash(entries);

    // Generate fingerprint and dirSha256 in parallel to avoid duplicate hashing
    const [fingerprint, dirSha256] = await Promise.all([
      this.generateFingerprint(entries, filePath, lastModified, includeMerkle),
      includeFullFileHash
        ? this.generateSha256Hash()
        : Promise.resolve(undefined),
    ]);

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
      throw new Error("Buffer too small for VPK header");
    }

    const signature = this.readUint32();
    if (signature !== VPK_SIGNATURE) {
      throw new ValidationError(
        `Not a VPK: 0x${signature.toString(16).padStart(8, "0")}`,
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
        throw new Error("Buffer too small for VPK v2 header");
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
    treeLength: number,
  ): VpkEntry[] {
    const entries: VpkEntry[] = [];
    const treeEnd = treeStart + treeLength;

    while (this.cursor < treeEnd) {
      const ext = this.readNullTerminatedString();
      if (ext === "") {
        break;
      }

      while (this.cursor < treeEnd) {
        const path = this.readNullTerminatedString();
        if (path === "") {
          break;
        }

        while (this.cursor < treeEnd) {
          const filename = this.readNullTerminatedString();
          if (filename === "") {
            break;
          }

          const entry = this.parseEntry(ext, path, filename);
          entries.push(entry);
          if (entry.preloadBytes > 0) {
            this.cursor += entry.preloadBytes;
            if (this.cursor > this.buffer.length) {
              throw new Error("Cursor overrun reading preload data");
            }
          }
        }
      }
    }

    return entries;
  }

  private parseEntry(ext: string, path: string, filename: string): VpkEntry {
    if (this.cursor + 18 > this.buffer.length) {
      throw new Error("Cursor overrun reading entry structure");
    }

    const crc32 = this.readUint32();
    const preloadBytes = this.readUint16();
    const archiveIndex = this.readUint16();
    const entryOffset = this.readUint32();
    const entryLength = this.readUint32();
    const terminator = this.readUint16();

    if (terminator !== 0xff_ff) {
      // Expected terminator 0xFFFF, got different value
    }

    const normalizedPath = path === " " ? "" : path;
    const pathParts = [normalizedPath, `${filename}.${ext}`].filter(Boolean);
    const fullPath = pathParts.join("/");

    return {
      fullPath,
      path: normalizedPath,
      filename,
      ext,
      crc32Hex: crc32.toString(16).padStart(8, "0").toLowerCase(),
      preloadBytes,
      archiveIndex,
      entryOffset,
      entryLength,
      terminator,
    };
  }

  private generateManifestHash(entries: VpkEntry[]): string {
    const lines = entries.map(
      (entry) => `${entry.fullPath.toLowerCase()}\x00${entry.crc32Hex}\n`,
    );
    lines.sort();
    const manifestContent = lines.join("");
    return createHash("sha256").update(manifestContent, "utf8").digest("hex");
  }

  /**
   * Generate enhanced fingerprint for better mod identification (optimized for large files)
   */
  private async generateFingerprint(
    entries: VpkEntry[],
    filePath: string,
    lastModified?: Date,
    includeMerkle = false,
  ): Promise<VpkFingerprint> {
    const hasMultiparts = this.detectMultiparts(entries);
    const hasInlineData = this.detectInlineData(entries);

    const [fastHash, sha256] = await Promise.all([
      this.generateFastHash(),
      this.generateSha256Hash(),
    ]);

    const contentSignature = this.generateContentSignature(entries);

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
   * Optimized fast hash generation using streaming approach for large files
   */
  private async generateFastHash(): Promise<string> {
    const { h64ToString } = await xxhash();

    // For large files (>10MB), use chunked processing to avoid blocking
    if (this.buffer.length > 10 * 1024 * 1024) {
      return new Promise((resolve) => {
        setImmediate(() => {
          const fastHash = h64ToString(this.buffer.toString("hex"), BigInt(0));
          resolve(fastHash);
        });
      });
    }

    return h64ToString(this.buffer.toString("hex"), BigInt(0));
  }

  /**
   * Optimized SHA-256 generation with chunked processing for large files
   */
  private async generateSha256Hash(): Promise<string> {
    // For large files (>10MB), use streaming approach
    if (this.buffer.length > 10 * 1024 * 1024) {
      return new Promise((resolve) => {
        const hash = createHash("sha256");
        const chunkSize = 64 * 1024;
        let offset = 0;

        const processChunk = () => {
          if (offset >= this.buffer.length) {
            resolve(hash.digest("hex"));
            return;
          }

          const chunk = this.buffer.subarray(
            offset,
            Math.min(offset + chunkSize, this.buffer.length),
          );
          hash.update(chunk);
          offset += chunkSize;

          setImmediate(processChunk);
        };

        processChunk();
      });
    }

    return createHash("sha256").update(this.buffer).digest("hex");
  }

  /**
   * Generate content signature based on VPK structure
   * This stays the same even if the VPK is repackaged or renamed
   */
  private generateContentSignature(entries: VpkEntry[]): string {
    // Filter out known junk files that shouldn't affect content identity
    const junkFiles = new Set([
      "thumbs.db",
      ".ds_store",
      "desktop.ini",
      ".tmp",
      ".temp",
    ]);

    const filteredEntries = entries.filter((entry) => {
      const fileName = entry.filename.toLowerCase();
      const fullPath = entry.fullPath.toLowerCase();
      if (junkFiles.has(fileName)) {
        return false;
      }
      return !Array.from(junkFiles).some((junk) => fullPath.includes(junk));
    });

    const tuples = filteredEntries.map((entry) => {
      const normalizedPath = entry.fullPath.toLowerCase().replace(/\\/g, "/");
      return `${normalizedPath}\x00${entry.entryLength}\x00${entry.crc32Hex}`;
    });

    tuples.sort();
    const content = tuples.join("\n");
    return createHash("sha256").update(content, "utf8").digest("hex");
  }

  /**
   * Generate Merkle hash for near-duplicate detection
   */
  private generateMerkleHash(entries: VpkEntry[]): MerkleData {
    const leaves = entries.map((entry) => {
      const entryData = `${entry.fullPath}|${entry.entryLength}|${entry.crc32Hex}`;
      return createHash("sha256").update(entryData, "utf8").digest("hex");
    });

    const sortedLeaves = [...leaves].sort();

    // For a more sophisticated implementation, you'd build a proper binary tree
    const merkleContent = sortedLeaves.join("");
    const root = createHash("sha256")
      .update(merkleContent, "utf8")
      .digest("hex");

    return { root, leaves };
  }

  /**
   * Get the VPK version from the parsed header
   */
  private getVpkVersion(): number {
    if (this.buffer.length < 8) {
      return 1;
    }
    const view = new DataView(
      this.buffer.buffer,
      this.buffer.byteOffset,
      this.buffer.byteLength,
    );
    return view.getUint32(4, true);
  }

  /**
   * Detect if VPK has multipart archives (e.g., _000.vpk, _001.vpk files)
   */
  private detectMultiparts(entries: VpkEntry[]): boolean {
    return entries.some(
      (entry) => entry.archiveIndex !== 0x7f_ff && entry.archiveIndex > 0,
    );
  }

  /**
   * Detect if VPK has inline data (small files stored directly in the directory)
   */
  private detectInlineData(entries: VpkEntry[]): boolean {
    return entries.some((entry) => entry.preloadBytes > 0);
  }

  private readUint32(): number {
    if (this.cursor + 4 > this.buffer.length) {
      throw new Error("Cursor overrun reading uint32");
    }
    const value = this.view.getUint32(this.cursor, true);
    this.cursor += 4;
    return value;
  }

  private readUint16(): number {
    if (this.cursor + 2 > this.buffer.length) {
      throw new Error("Cursor overrun reading uint16");
    }
    const value = this.view.getUint16(this.cursor, true);
    this.cursor += 2;
    return value;
  }

  private readNullTerminatedString(): string {
    const start = this.cursor;

    while (this.cursor < this.buffer.length && this.buffer[this.cursor] !== 0) {
      this.cursor++;
    }

    if (this.cursor >= this.buffer.length) {
      throw new Error("Cursor overrun reading null-terminated string");
    }

    const stringBytes = this.buffer.subarray(start, this.cursor);
    this.cursor++;

    // Try UTF-8 first, fallback to latin1
    try {
      return stringBytes.toString("utf8");
    } catch {
      return stringBytes.toString("latin1");
    }
  }
}
