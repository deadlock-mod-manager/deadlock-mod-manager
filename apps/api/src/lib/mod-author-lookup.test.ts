import { describe, expect, test } from "bun:test";
import { parseModAuthorLookup } from "./mod-author-lookup";

describe("parseModAuthorLookup", () => {
  test("keeps internal author ids unchanged", () => {
    expect(
      parseModAuthorLookup("mod_author_01k4kfbw8e68b8n1p4tpy9j3rg"),
    ).toEqual({
      kind: "id",
      id: "mod_author_01k4kfbw8e68b8n1p4tpy9j3rg",
    });
  });

  test("parses provider-qualified GameBanana member ids", () => {
    expect(parseModAuthorLookup("gamebanana:12345")).toEqual({
      kind: "provider",
      provider: "gamebanana",
      remoteId: "12345",
    });
  });

  test("rejects malformed GameBanana member ids", () => {
    expect(parseModAuthorLookup("gamebanana:0")).toBeNull();
    expect(parseModAuthorLookup("gamebanana:not-a-number")).toBeNull();
  });
});
