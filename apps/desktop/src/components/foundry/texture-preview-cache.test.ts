import { expect, test } from "bun:test";
import { createTexturePreviewCache } from "./texture-preview-cache";

const KEY = "hero.vpk\nmaterials/body_color.vtex_c";
const CHECKPOINTS = [10, 50, 100];
const preview = (revision: number) =>
  `data:image/png;base64,revision-${revision}`;

test("each edit drops the previews of earlier revisions and rejects their late decodes", () => {
  const cache = createTexturePreviewCache<string>();
  const retained: [entries: number, characters: number][] = [];
  cache.set(KEY, 0, preview(0));
  for (let revision = 1; revision <= 100; revision++) {
    cache.setRevision(revision);
    // Decodes started before the edit, finishing before and after the new one.
    cache.set(KEY, revision - 1, "stale");
    cache.set(KEY, revision, preview(revision));
    cache.set(KEY, revision - 1, "stale");
    if (CHECKPOINTS.includes(revision)) {
      const stored = Array.from({ length: revision + 1 }, (_, written) =>
        cache.get(KEY, written),
      ).filter((dataUrl) => dataUrl !== undefined);
      retained.push([stored.length, stored.join("").length]);
    }
  }
  expect(retained).toEqual(
    CHECKPOINTS.map((revision) => [1, preview(revision).length]),
  );
  expect(cache.get(KEY, 100)).toBe(preview(100));
});
