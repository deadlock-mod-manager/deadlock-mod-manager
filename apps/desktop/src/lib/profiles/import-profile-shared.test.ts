import { describe, expect, it } from "bun:test";
import { profileSchema } from "@deadlock-mods/shared";
import {
  getProfileModCandidateIds,
  rewriteProfileIdentities,
} from "./import-profile-shared";

describe("shared profile identities", () => {
  it("queries both namespaces for a legacy numeric identity", () => {
    const profile = profileSchema.parse({
      version: "2",
      payload: { mods: [{ remoteId: "42" }], loadOrder: ["42"] },
    });

    expect(getProfileModCandidateIds(profile, 0)).toEqual(["42", "snd-42"]);
  });

  it("uses the explicit v3 namespace", () => {
    const profile = profileSchema.parse({
      version: "3",
      payload: {
        mods: [{ remoteId: "42", submissionType: "sound" }],
        loadOrder: ["42"],
      },
    });

    expect(getProfileModCandidateIds(profile, 0)).toEqual(["snd-42"]);
  });

  it("rewrites download identities and load order after legacy resolution", () => {
    const profile = profileSchema.parse({
      version: "2",
      payload: {
        mods: [
          {
            remoteId: "42",
            selectedDownloads: [
              { remoteId: "42", file: "voice.zip", url: "test", size: 1 },
            ],
          },
        ],
        loadOrder: ["42"],
      },
    });

    const rewritten = rewriteProfileIdentities(profile, ["snd-42"]);
    expect(rewritten.payload.mods[0]?.remoteId).toBe("snd-42");
    expect(rewritten.payload.mods[0]?.selectedDownloads?.[0]?.remoteId).toBe(
      "snd-42",
    );
    expect(
      rewritten.version === "1" ? [] : rewritten.payload.loadOrder,
    ).toEqual(["snd-42"]);
  });
});
