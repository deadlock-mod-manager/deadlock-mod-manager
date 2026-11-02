import { expect, test } from "vitest";
import { buildTaxonomyDocument } from "../taxonomy";

// Sources store these IDs, so a duplicate would merge two heroes or categories.
test("taxonomy IDs are unique kebab-case", () => {
  const { heroes, contentTypes } = buildTaxonomyDocument();
  for (const entries of [heroes, contentTypes]) {
    const ids = entries.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  }
});
