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

  it("bounds provider concurrency and leaves excess requirements unresolved", async () => {
    let active = 0;
    let maxActive = 0;
    let calls = 0;
    const resolver = new ServerModsResolver(
      async () => {
        calls += 1;
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 1));
        active -= 1;
        return null;
      },
      () => Promise.resolve([]),
    );
    const result = await resolver.resolve(
      Array.from({ length: 55 }, (_, index) => ({
        id: `required-${index + 1}`,
        provider: "gamebanana" as const,
        url: `https://gamebanana.com/mods/${index + 1}`,
      })),
    );

    expect(calls).toBe(50);
    expect(maxActive).toBeLessThanOrEqual(4);
    expect(result.resolved).toHaveLength(55);
    expect(result.resolved.at(-1)?.reason).toBe("too_many_requirements");
    expect(result.missing).toHaveLength(55);
  });

  it("does not let one slow lookup stall unrelated lookups", async () => {
    const completed: string[] = [];
    const resolver = new ServerModsResolver(
      async (identity) => {
        await new Promise((resolve) =>
          setTimeout(resolve, identity.submissionId === "1" ? 200 : 1),
        );
        completed.push(identity.submissionId);
        return null;
      },
      () => Promise.resolve([]),
    );

    await resolver.resolve(
      Array.from({ length: 8 }, (_, index) => ({
        id: `required-${index + 1}`,
        provider: "gamebanana" as const,
        url: `https://gamebanana.com/mods/${index + 1}`,
      })),
    );

    expect(completed).toHaveLength(8);
    expect(completed.at(-1)).toBe("1");
  });

  it("returns partial results once the deadline elapses", async () => {
    const resolver = new ServerModsResolver(
      async (identity) => {
        if (Number(identity.submissionId) > 2) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
        return null;
      },
      () => Promise.resolve([]),
      50,
    );

    const startedAt = Date.now();
    const result = await resolver.resolve(
      Array.from({ length: 6 }, (_, index) => ({
        id: `required-${index + 1}`,
        provider: "gamebanana" as const,
        url: `https://gamebanana.com/mods/${index + 1}`,
      })),
    );

    expect(Date.now() - startedAt).toBeLessThan(400);
    expect(result.resolved).toHaveLength(6);
    expect(result.resolved[0]?.reason).toBe("not_found");
    expect(result.resolved[1]?.reason).toBe("not_found");
    expect(
      result.resolved.filter((item) => item.reason === "timed_out").length,
    ).toBeGreaterThan(0);
  });
});
