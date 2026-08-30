import { describe, expect, it } from "vitest";
import { profileSchema } from "../schemas/profile.schemas";

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

  it("parses v3 profiles with explicit submission namespaces", () => {
    const profile = profileSchema.parse({
      version: "3",
      payload: {
        mods: [
          { remoteId: "42", submissionType: "mod" },
          { remoteId: "snd-42", submissionType: "sound" },
        ],
        loadOrder: ["42", "snd-42"],
      },
    });

    expect(profile.version).toBe("3");
    expect(profile.payload.mods[1]).toMatchObject({
      remoteId: "snd-42",
      submissionType: "sound",
    });
  });

  it("rejects v3 profiles without a submission type", () => {
    expect(
      profileSchema.safeParse({
        version: "3",
        payload: { mods: [{ remoteId: "42" }], loadOrder: ["42"] },
      }).success,
    ).toBe(false);
  });
});
