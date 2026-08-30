import { describe, expect, it } from "bun:test";
import {
  fetchGameBananaSubmissionSnapshot,
  parseGameBananaSlug,
} from "./gamebanana-submission";

describe("parseGameBananaSlug", () => {
  it("keeps mod and sound IDs in separate namespaces", () => {
    expect(parseGameBananaSlug("42")).toEqual({
      provider: "gamebanana",
      submissionType: "mod",
      submissionId: "42",
    });
    expect(parseGameBananaSlug("snd-42")?.submissionType).toBe("sound");
  });

  it("rejects ambiguous and non-canonical IDs", () => {
    expect(parseGameBananaSlug("0")).toBeNull();
    expect(parseGameBananaSlug("042")).toBeNull();
    expect(parseGameBananaSlug("https://gamebanana.com/mods/42")).toBeNull();
  });
});

describe("fetchGameBananaSubmissionSnapshot", () => {
  it("hydrates moderation fields from a Deadlock profile", async () => {
    const snapshot = await fetchGameBananaSubmissionSnapshot(
      parseGameBananaSlug("42")!,
      (() =>
        Promise.resolve(
          Response.json({
            _idRow: 42,
            _sName: "Movement map",
            _aSubmitter: { _sName: "Mapper" },
            _aGame: { _idRow: 20_948 },
            _aSuperCategory: { _sName: "Maps" },
          }),
        )) as typeof fetch,
    );
    expect(snapshot).toMatchObject({
      slug: "42",
      name: "Movement map",
      author: "Mapper",
      isMap: true,
    });
  });

  it("rejects profiles for other games", async () => {
    const snapshot = await fetchGameBananaSubmissionSnapshot(
      parseGameBananaSlug("snd-42")!,
      (() =>
        Promise.resolve(
          Response.json({
            _idRow: 42,
            _sName: "Other sound",
            _aSubmitter: { _sName: "Author" },
            _aGame: { _idRow: 1 },
          }),
        )) as typeof fetch,
    );
    expect(snapshot).toBeNull();
  });
});
