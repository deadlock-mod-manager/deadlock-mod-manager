import { existsSync, readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
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
        file_count: 3,
        fast_hash: expect.any(String),
        manifest_sha256: expect.any(String),
      });

      expect(info.fast_hash).toHaveLength(16); // xxHash64 hex string
      expect(info.manifest_sha256).toHaveLength(64); // SHA256 hex string
    });

    it("should get basic VPK info from file", () => {
      const info = getVpkInfoFromFile(testVpkPath);

      expect(info).toMatchObject({
        version: 2,
        file_count: 3,
        fast_hash: expect.any(String),
        manifest_sha256: expect.any(String),
      });
    });
  });

  describe("VPK Hashes", () => {
    it("should calculate VPK hashes from buffer", () => {
      const hashes = getVpkHashes(testBuffer, testVpkPath);

      expect(hashes).toMatchObject({
        fast_hash: expect.any(String),
        manifest_sha256: expect.any(String),
        content_signature: expect.any(String),
        has_multiparts: expect.any(Boolean),
        has_inline_data: expect.any(Boolean),
      });

      expect(hashes.fast_hash).toHaveLength(16);
      expect(hashes.manifest_sha256).toHaveLength(64);
      expect(hashes.content_signature).toHaveLength(16);
    });

    it("should calculate VPK hashes from file", () => {
      const hashes = getVpkHashesFromFile(testVpkPath);

      expect(hashes).toMatchObject({
        fast_hash: expect.any(String),
        manifest_sha256: expect.any(String),
        content_signature: expect.any(String),
        has_multiparts: expect.any(Boolean),
        has_inline_data: expect.any(Boolean),
      });
    });
  });

  describe("VPK Parsing", () => {
    it("should parse VPK from buffer", () => {
      const parsed = parseVpk(testBuffer, {
        include_full_file_hash: true,
        include_merkle: true,
        file_path: testVpkPath,
      });

      expect(parsed).toMatchObject({
        header: expect.objectContaining({
          signature: expect.any(Number),
          version: 2,
          tree_size: expect.any(Number),
        }),
        entries: expect.any(Array),
        tree_length: expect.any(Number),
        fingerprint: expect.objectContaining({
          fast_hash: expect.any(String),
          manifest_sha256: expect.any(String),
          content_signature: expect.any(String),
        }),
      });

      expect(parsed.entries).toHaveLength(3);
      expect(parsed.entries[0]).toMatchObject({
        path: expect.any(String),
        crc: expect.any(Number),
        preload_bytes: expect.any(Number),
        archive_index: expect.any(Number),
        entry_offset: expect.any(Number),
        entry_length: expect.any(Number),
      });
    });

    it("should parse VPK from file", () => {
      const parsed = parseVpkFile(testVpkPath, {
        include_full_file_hash: true,
        include_merkle: true,
      });

      expect(parsed.entries).toHaveLength(3);
      expect(parsed.header.version).toBe(2);
    });
  });

  describe("VpkParser Class", () => {
    it("should parse VPK using static parse method", () => {
      const parsed = VpkParser.parse(testBuffer, {
        include_full_file_hash: true,
      });

      expect(parsed.entries).toHaveLength(3);
      expect(parsed.header.version).toBe(2);
    });

    it("should parse VPK using static parseFile method", () => {
      const parsed = VpkParser.parseFile(testVpkPath, {
        include_merkle: true,
      });

      expect(parsed.entries).toHaveLength(3);
      expect(parsed.fingerprint.merkle_root).toBeDefined();
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
      const hashes = getVpkHashes(testBuffer);
      const end = performance.now();

      expect(end - start).toBeLessThan(5); // Should be under 5ms
      expect(hashes.fast_hash).toBeDefined();
    });
  });
});
