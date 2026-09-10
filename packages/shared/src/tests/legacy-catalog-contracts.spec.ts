import { describe, expect, it } from "vitest";
import {
  CheckUpdatesInputSchema,
  CheckUpdatesResponseSchema,
  ModDownloadsResponseSchema,
  ModDownloadsV2ResponseSchema,
  ModSchema,
  ModsListResponseSchema,
} from "../schemas/mod.schemas";
import { ResolvedRequirementSchema } from "../schemas/server-browser.schemas";

const mod = {
  id: "mod_legacy",
  remoteId: "42",
  name: "Legacy fixture",
  description: null,
  remoteUrl: "https://gamebanana.com/mods/42",
  category: "Skins",
  likes: 0,
  author: "Fixture",
  downloadable: true,
  remoteAddedAt: "2026-01-01T00:00:00.000Z",
  remoteUpdatedAt: "2026-01-02T00:00:00.000Z",
  tags: [],
  images: [],
  hero: null,
  isAudio: false,
  audioUrl: null,
  downloadCount: 0,
  isNSFW: false,
  filesUpdatedAt: "2026-01-02T00:00:00.000Z",
  createdAt: null,
  updatedAt: null,
};
const download = {
  url: "https://gamebanana.com/dl/123",
  size: 128,
  name: "legacy.zip",
  createdAt: null,
  updatedAt: null,
  md5Checksum: null,
};

describe("legacy catalog contracts during direct-client rollout", () => {
  it("accepts legacy catalog entries without direct-client fields", () => {
    expect(ModSchema.parse(mod).remoteId).toBe("42");
    expect(ModsListResponseSchema.parse([mod])).toHaveLength(1);
  });

  it("preserves array downloads and the v2 multi-download envelope", () => {
    expect(ModDownloadsResponseSchema.parse([download])).toEqual([download]);
    expect(
      ModDownloadsV2ResponseSchema.parse({ downloads: [download], count: 1 }),
    ).toEqual({ downloads: [download], count: 1 });
  });

  it("accepts update checks from clients that do not send selected file IDs", () => {
    const request = CheckUpdatesInputSchema.parse({
      mods: [{ remoteId: "42", installedAt: "2026-01-01T00:00:00.000Z" }],
    });
    expect(request.mods[0].installedAt).toEqual(
      new Date("2026-01-01T00:00:00.000Z"),
    );
    const response = CheckUpdatesResponseSchema.parse({
      updates: [{ mod, downloads: [download] }],
    });
    expect(response.updates[0].mod.remoteId).toBe("42");
    expect(response.updates[0].downloads).toEqual([download]);
  });

  it("supplies new desktop defaults without changing legacy catalog schemas", () => {
    const resolved = ResolvedRequirementSchema.parse({
      name: "Legacy fixture",
      provider: "gamebanana",
      url: "https://gamebanana.com/mods/42",
      resolved: true,
      remoteId: "42",
      mod,
    });
    expect(resolved.mod).toMatchObject({
      isBlacklisted: false,
      isObsolete: false,
      overrides: null,
      metadata: null,
      dependencies: null,
    });
    expect(ModSchema.parse(mod)).not.toHaveProperty("isBlacklisted");
  });
});
