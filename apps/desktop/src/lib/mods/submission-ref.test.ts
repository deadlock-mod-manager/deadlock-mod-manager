import { describe, expect, it } from "bun:test";
import { parseSubmissionSlug, serializeSubmissionRef } from "./submission-ref";

describe("submission slugs", () => {
  it.each([
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
      "local-550e8400-e29b-41d4-a716-446655440000",
      {
        provider: "local",
        submissionType: "mod",
        submissionId: "550e8400-e29b-41d4-a716-446655440000",
      },
    ],
  ] as const)("round-trips %s", (slug, expected) => {
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
