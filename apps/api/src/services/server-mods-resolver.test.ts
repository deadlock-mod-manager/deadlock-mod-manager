import { describe, expect, it } from "bun:test";
import {
  parseGameBananaSubmissionUrl,
  ServerModsResolver,
} from "./server-mods-resolver";

describe("parseGameBananaSubmissionUrl", () => {
  it("preserves mod and sound namespaces", () => {
    expect(
      parseGameBananaSubmissionUrl("https://gamebanana.com/mods/42"),
    ).toMatchObject({ submissionType: "mod", submissionId: "42" });
    expect(
      parseGameBananaSubmissionUrl("https://gamebanana.com/sounds/42/"),
    ).toMatchObject({ submissionType: "sound", submissionId: "42" });
  });

  it("rejects insecure, ambiguous, and lookalike URLs", () => {
    expect(
      parseGameBananaSubmissionUrl("http://gamebanana.com/mods/42"),
    ).toBeNull();
    expect(
      parseGameBananaSubmissionUrl("https://gamebanana.com/maps/42"),
    ).toBeNull();
    expect(
      parseGameBananaSubmissionUrl("https://gamebanana.com.example/mods/42"),
    ).toBeNull();
  });
});

describe("ServerModsResolver", () => {
  it("returns provider failures as explicit unresolved requirements", async () => {
    const resolver = new ServerModsResolver(
      () => Promise.reject(new Error("provider unavailable")),
      () => Promise.resolve([]),
    );
    const result = await resolver.resolve([
      {
        id: "required-mod",
        provider: "gamebanana",
        url: "https://gamebanana.com/mods/42",
      },
    ]);
    expect(result.resolved[0]).toMatchObject({
      resolved: false,
      remoteId: "42",
      reason: "provider_failure",
    });
    expect(result.missing).toHaveLength(1);
  });
});
