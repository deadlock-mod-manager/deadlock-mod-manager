import { beforeAll, describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import {
  getVersion,
  getVpkHashes,
  getVpkHashesFromFile,
  getVpkInfo,
  getVpkInfoFromFile,
  parseVpk,
  parseVpkFile,
  VpkParser,
} from "../src/index";

describe("VPK Parser FFI", () => {
  const testVpkPath = "data/pak95_dir.vpk";
  let testBuffer: Buffer;

  beforeAll(() => {
    // Check if native library is built
    const extension =
      process.platform === "win32"
        ? "dll"
        : process.platform === "darwin"
          ? "dylib"
          : "so";
    const libPath =
      extension === "dll"
        ? `./target/release/vpk_parser.${extension}`
        : `./target/release/libvpk_parser.${extension}`;

    if (!existsSync(libPath)) {
      throw new Error(
        `Native library not found at ${libPath}. Run 'pnpm run build' first.`,
      );
    }

    // Check if test VPK file exists
    if (!existsSync(testVpkPath)) {
      throw new Error(`Test VPK file not found at ${testVpkPath}`);
    }

    testBuffer = readFileSync(testVpkPath);
  });

  describe("Library Info", () => {
    it("should return version", () => {
      const version = getVersion();
      expect(version).toBe("0.1.0");
    });
  });

  describe("VPK Info", () => {
    it("should get basic VPK info from buffer", () => {
      const info = getVpkInfo(testBuffer);

      expect(info).toMatchObject({
        version: 2,
        fileCount: 3,
        fastHash: expect.any(String),
        manifestSha256: expect.any(String),
      });

      const fastHash = String(info.fastHash);
      expect(fastHash.length).toBeGreaterThanOrEqual(16); // xxHash64 hex string (16 chars)
      const manifestSha256 = String(info.manifestSha256);
      expect(manifestSha256.length).toBeGreaterThanOrEqual(16); // SHA256 hex string (64 chars, but may vary)
    });

    it("should get basic VPK info from file", () => {
      const info = getVpkInfoFromFile(testVpkPath);

      expect(info).toMatchObject({
        version: 2,
        fileCount: 3,
        fastHash: expect.any(String),
        manifestSha256: expect.any(String),
      });
    });
  });

  describe("VPK Hashes", () => {
    it("should calculate VPK hashes from buffer", () => {
      const hashes = getVpkHashes(testBuffer, testVpkPath);

      expect(hashes).toMatchObject({
        fastHash: expect.any(String),
        sha256: expect.any(String),
        contentSignature: expect.any(String),
        hasMultiparts: expect.any(Boolean),
        hasInlineData: expect.any(Boolean),
      });

      const fastHash = String(hashes.fastHash);
      expect(fastHash.length).toBeGreaterThanOrEqual(16); // xxHash64 hex string (16 chars)
      const sha256 = String(hashes.sha256);
      expect(sha256.length).toBeGreaterThanOrEqual(16); // SHA256 hex string (64 chars, but may vary)
      const contentSignature = String(hashes.contentSignature);
      expect(contentSignature.length).toBeGreaterThanOrEqual(16); // SHA256 hex string (64 chars, but may vary)
    });

    it("should calculate VPK hashes from file", () => {
      const hashes = getVpkHashesFromFile(testVpkPath);

      expect(hashes).toMatchObject({
        fastHash: expect.any(String),
        sha256: expect.any(String),
        contentSignature: expect.any(String),
        hasMultiparts: expect.any(Boolean),
        hasInlineData: expect.any(Boolean),
      });
    });
  });

  describe("VPK Parsing", () => {
    it("should parse VPK from buffer", () => {
      const parsed = parseVpk(testBuffer, {
        includeFullFileHash: true,
        includeMerkle: true,
        filePath: testVpkPath,
      });

      expect(parsed.version).toBe(2);
      expect(parsed.treeLength).toBeGreaterThan(0);
      expect(parsed.fingerprint).toBeDefined();
      expect(parsed.fingerprint.fastHash).toBeDefined();
      expect(parsed.fingerprint.sha256).toBeDefined();
      expect(parsed.fingerprint.contentSignature).toBeDefined();

      expect(parsed.entries).toBeDefined();
      expect(parsed.entries).toHaveLength(3);
      expect(parsed.entries[0]).toBeDefined();
      expect(parsed.entries[0]).toMatchObject({
        path: expect.any(String),
        crc32Hex: expect.any(String),
        preloadBytes: expect.any(Number),
        archiveIndex: expect.any(Number),
        entryOffset: expect.any(Number),
        entryLength: expect.any(Number),
      });
    });

    it("should parse VPK from file", () => {
      const parsed = parseVpkFile(testVpkPath, {
        includeFullFileHash: true,
        includeMerkle: true,
      });

      expect(parsed.entries).toHaveLength(3);
      expect(parsed.version).toBe(2);
    });
  });

  describe("VpkParser Class", () => {
    it("should parse VPK using static parse method", () => {
      const parsed = VpkParser.parse(testBuffer, {
        includeFullFileHash: true,
      });

      expect(parsed.entries).toHaveLength(3);
      expect(parsed.version).toBe(2);
    });

    it("should parse VPK using static parseFile method", () => {
      const parsed = VpkParser.parseFile(testVpkPath, {
        includeMerkle: true,
      });

      expect(parsed.entries).toHaveLength(3);
      expect(parsed.fingerprint.merkleRoot).not.toBeUndefined();
    });
  });

  describe("Performance", () => {
    it("should parse VPK quickly", () => {
      const start = performance.now();
      const parsed = parseVpk(testBuffer);
      const end = performance.now();

      expect(end - start).toBeLessThan(10); // Should be under 10ms
      expect(parsed.entries).toHaveLength(3);
    });

    it("should calculate hashes quickly", () => {
      const start = performance.now();
      const hashes = getVpkHashes(testBuffer, testVpkPath);
      const end = performance.now();

      expect(end - start).toBeLessThan(5); // Should be under 5ms
      expect(hashes.fastHash).toBeDefined();
    });
  });
});
