import { describe, expect, it } from "bun:test";
import type { ModDownload } from "@deadlock-mods/database";
import { buildModFileJob } from "@/lib/mod-file-job";

describe("buildModFileJob", () => {
  it("uses provider file identity and the upstream marker", () => {
    const job = buildModFileJob(
      {
        provider: "gamebanana",
        submissionType: "sound",
        submissionId: "42",
        slug: "snd-42",
        modName: "Voice pack",
        filesUpdatedAt: "2026-08-30T12:00:00.000Z",
      },
      {
        id: "mod_download_internal",
        modId: "mod_internal",
        remoteId: "9001",
        url: "https://gamebanana.com/dl/9001",
        size: 123,
        file: "voice.zip",
        description: null,
        md5Checksum: null,
        createdAt: null,
        updatedAt: null,
      } satisfies ModDownload,
    );
    expect(job).toMatchObject({
      submissionType: "sound",
      submissionId: "42",
      fileId: "9001",
      upstreamUpdatedAt: "2026-08-30T12:00:00.000Z",
    });
    expect(job).not.toHaveProperty("modId");
    expect(job).not.toHaveProperty("modDownloadId");
  });
});
