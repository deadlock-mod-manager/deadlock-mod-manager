import { describe, expect, it } from "bun:test";
import type { SubmissionRef } from "@/types/generated/SubmissionRef";
import {
  gameBananaPageUrl,
  parseSubmissionSlug,
  serializeSubmissionRef,
} from "./submission-ref";

describe("submission slugs", () => {
  const roundTrips: readonly (readonly [string, SubmissionRef])[] = [
    [
      "123456",
      {
        provider: "gamebanana",
        submissionType: "mod",
        submissionId: "123456",
      },
    ],
    [
      "snd-123456",
      {
        provider: "gamebanana",
        submissionType: "sound",
        submissionId: "123456",
      },
    ],
    [
      "wip-103122",
      {
        provider: "gamebanana",
        submissionType: "wip",
        submissionId: "103122",
      },
    ],
    [
      "local-550e8400-e29b-41d4-a716-446655440000",
      {
        provider: "local",
        submissionType: "mod",
        submissionId: "550e8400-e29b-41d4-a716-446655440000",
      },
    ],
  ];
  it.each(roundTrips)("round-trips %s", (slug, expected) => {
    const parsed = parseSubmissionSlug(slug);

    expect(parsed).toEqual(expected);
    expect(parsed && serializeSubmissionRef(parsed)).toBe(slug);
  });

  it.each([
    "",
    "0",
    "01",
    "snd-",
    "snd-0",
    "snd-one",
    "wip-",
    "wip-01",
    "local-",
    "local-abc-123",
    "local--abc",
    "local-a_b",
    "123\n",
    "snd-123\n",
    "local-550e8400-e29b-41d4-a716-446655440000\n",
    "gamebanana:mod:1",
  ])("rejects malformed slug %s", (slug) => {
    expect(parseSubmissionSlug(slug)).toBeNull();
  });
});

describe("GameBanana page URLs", () => {
  it.each([
    ["123456", "https://gamebanana.com/mods/123456"],
    ["snd-123456", "https://gamebanana.com/sounds/123456"],
    ["wip-103122", "https://gamebanana.com/wips/103122"],
  ])("links %s to its page", (slug, url) => {
    expect(gameBananaPageUrl(slug)).toBe(url);
  });

  it.each([
    "local-550e8400-e29b-41d4-a716-446655440000",
    "local-reset-skin",
    "",
    "snd-",
    "abc",
  ])("has no page for %s", (slug) => {
    expect(gameBananaPageUrl(slug)).toBeNull();
  });
});
