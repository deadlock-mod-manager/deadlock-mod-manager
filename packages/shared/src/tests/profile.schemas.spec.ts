import { describe, expect, it } from "vitest";
import {
  getOrderedSharedProfileMods,
  getSharedProfileLoadOrder,
  profileSchema,
  type SharedProfile,
} from "../schemas/profile.schemas";

describe("profileSchema", () => {
  it("parses v1 profiles", () => {
    const profile = profileSchema.parse({
      version: "1",
      payload: {
        mods: [{ remoteId: "mod-a" }, { remoteId: "mod-b" }],
      },
    });

    expect(profile.version).toBe("1");
    expect(profile.payload.mods).toHaveLength(2);
  });

  it("parses v2 profiles with load order", () => {
    const profile = profileSchema.parse({
      version: "2",
      payload: {
        mods: [
          { remoteId: "mod-b" },
          { remoteId: "mod-c" },
          { remoteId: "mod-a" },
        ],
        loadOrder: ["mod-a", "mod-b", "mod-c"],
      },
    });

    expect(profile.version).toBe("2");
    expect(profile.payload.mods).toHaveLength(3);
    expect(profile.payload.loadOrder).toEqual(["mod-a", "mod-b", "mod-c"]);
  });
});

describe("getSharedProfileLoadOrder", () => {
  it("returns v2 load order with unknown and duplicate IDs removed", () => {
    const profile: SharedProfile = {
      version: "2",
      payload: {
        mods: [{ remoteId: "mod-a" }, { remoteId: "mod-b" }],
        loadOrder: [
          "mod-b",
          "unknown-mod",
          "mod-a",
          "mod-b",
          "another-unknown",
        ],
      },
    };

    expect(getSharedProfileLoadOrder(profile)).toEqual(["mod-b", "mod-a"]);
  });

  it("appends mods missing from v2 load order", () => {
    const profile: SharedProfile = {
      version: "2",
      payload: {
        mods: [
          { remoteId: "mod-a" },
          { remoteId: "mod-b" },
          { remoteId: "mod-c" },
        ],
        loadOrder: ["mod-b"],
      },
    };

    expect(getSharedProfileLoadOrder(profile)).toEqual([
      "mod-b",
      "mod-a",
      "mod-c",
    ]);
  });

  it("returns mods in payload order for v1 profiles", () => {
    const profile: SharedProfile = {
      version: "1",
      payload: {
        mods: [
          { remoteId: "mod-c" },
          { remoteId: "mod-a" },
          { remoteId: "mod-b" },
        ],
      },
    };

    expect(getSharedProfileLoadOrder(profile)).toEqual([
      "mod-c",
      "mod-a",
      "mod-b",
    ]);
  });
});

describe("getOrderedSharedProfileMods", () => {
  it("returns mods ordered by v2 load order", () => {
    const profile: SharedProfile = {
      version: "2",
      payload: {
        mods: [
          { remoteId: "mod-c" },
          { remoteId: "mod-a" },
          { remoteId: "mod-b" },
        ],
        loadOrder: ["mod-b", "mod-a", "mod-c"],
      },
    };

    const ordered = getOrderedSharedProfileMods(profile);

    expect(ordered.map((m) => m.remoteId)).toEqual([
      "mod-b",
      "mod-a",
      "mod-c",
    ]);
  });

  it("returns mods in payload order for v1 profiles", () => {
    const profile: SharedProfile = {
      version: "1",
      payload: {
        mods: [
          { remoteId: "mod-b" },
          { remoteId: "mod-a" },
        ],
      },
    };

    const ordered = getOrderedSharedProfileMods(profile);

    expect(ordered.map((m) => m.remoteId)).toEqual(["mod-b", "mod-a"]);
  });

  it("preserves mod data when reordering", () => {
    const profile: SharedProfile = {
      version: "2",
      payload: {
        mods: [
          {
            remoteId: "mod-a",
            selectedDownload: {
              remoteId: "mod-a",
              file: "file-a.zip",
              url: "https://example.com/a",
              size: 100,
            },
          },
          { remoteId: "mod-b" },
        ],
        loadOrder: ["mod-b", "mod-a"],
      },
    };

    const ordered = getOrderedSharedProfileMods(profile);

    expect(ordered[0]?.remoteId).toBe("mod-b");
    expect(ordered[1]?.remoteId).toBe("mod-a");
    expect(ordered[1]?.selectedDownload?.file).toBe("file-a.zip");
  });
});
