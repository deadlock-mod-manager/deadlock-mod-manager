import { describe, expect, it, mock, test } from "bun:test";
import type { CachedVPK } from "@deadlock-mods/database";

const cachedVpk = (
  id: string,
  sizeBytes: number,
  fileCount: number,
): CachedVPK => ({
  id,
  modId: null,
  modDownloadId: null,
  provider: null,
  submissionType: null,
  submissionId: null,
  fileId: null,
  upstreamUpdatedAt: null,
  sourcePath: `${id}.vpk`,
  sizeBytes,
  fastHash: "fast",
  sha256: id,
  contentSig: "content",
  vpkVersion: 2,
  fileCount,
  hasMultiparts: false,
  hasInlineData: false,
  merkleRoot: null,
  state: "ok",
  scannedAt: new Date(0),
  fileMtime: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

// The first candidate's file count equals the queried byte size, which the
// old count-versus-bytes comparison treated as an exact match.
const contentMatches = [
  cachedVpk("vpk_count_collision", 9_000_000, 4096),
  cachedVpk("vpk_closest_size", 4100, 12),
];

// Bun module mocks persist across files; isolate the database mock from other suites.
if (process.env.DMM_MOD_ANALYSER_TEST_CHILD !== "1") {
  it("ranks hash-only matches with an isolated database mock", () => {
    const result = Bun.spawnSync([process.execPath, "test", import.meta.path], {
      env: { ...process.env, DMM_MOD_ANALYSER_TEST_CHILD: "1" },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(new TextDecoder().decode(result.stderr)).toContain("1 pass");
    expect(result.exitCode).toBe(0);
  });
} else {
  mock.module("@deadlock-mods/database", () => ({
    db: {},
    VpkRepository: class {
      async findBySha256() {
        return undefined;
      }
      async findByContentSignature() {
        return contentMatches;
      }
      async findByFastHashAndSize() {
        return [];
      }
      async findByMerkleRoot() {
        return [];
      }
    },
  }));
  mock.module("@deadlock-mods/vpk-parser", () => ({ VpkParser: class {} }));

  const { ModAnalyser } = await import("./mod-analyser");

  describe("ModAnalyser.analyseHashes", () => {
    test("ranks content signature matches by byte size, not file count", async () => {
      const [result] = await ModAnalyser.instance.analyseHashes({
        contentSignature: "content",
        fileSize: 4096,
      });

      expect(result?.matchedVpk.id).toBe("vpk_closest_size");
      expect(result?.match.alternativeMatches?.map((m) => m.id)).toEqual([
        "vpk_count_collision",
      ]);
    });
  });
}
