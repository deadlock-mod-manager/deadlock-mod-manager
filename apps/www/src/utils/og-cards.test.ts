import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OG_CARDS, ogCardImagePath } from "./og-cards";
import { INDEXABLE_PATHS, seo } from "./seo";

describe("OG cards", () => {
  it.each(Object.entries(OG_CARDS))("%s has a generated image", (_, card) => {
    expect(existsSync(join("public", ogCardImagePath(card)))).toBe(true);
  });

  it("only covers indexable pages", () => {
    const indexable: readonly string[] = INDEXABLE_PATHS;
    for (const path of Object.keys(OG_CARDS)) {
      expect(indexable).toContain(path);
    }
  });

  it("overrides the site image on pages with a card", () => {
    const { meta } = seo({ title: "V2", path: "/v2" });
    expect(meta).toContainEqual({
      property: "og:image",
      content: "https://deadlockmods.app/og/v2.png",
    });
  });
});
