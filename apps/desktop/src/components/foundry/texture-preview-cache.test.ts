import { expect, test } from "bun:test";
import { createTexturePreviewCache } from "./texture-preview-cache";

const KEY = "hero.vpk\nmaterials/body_color.vtex_c";
const CHECKPOINTS = [10, 50, 100];
const preview = (revision: number) =>
  `data:image/png;base64,revision-${revision}`;

test("each edit drops the previews of earlier revisions and rejects their late decodes", () => {
  const cache = createTexturePreviewCache<string>();
  const stored = (latest: number) =>
    Array.from({ length: latest + 1 }, (_, revision) =>
      cache.get(KEY, revision),
    ).filter((dataUrl) => dataUrl !== undefined);
  const retained: [entries: number, characters: number][] = [];
  // Anything still stored after an edit, before its own preview is decoded.
  const leftovers: string[] = [];
  cache.set(KEY, 0, preview(0));
  for (let revision = 1; revision <= 100; revision++) {
    cache.setRevision(revision);
    leftovers.push(...stored(revision));
    // Decodes started one and several edits back, finishing before and after
    // the new one.
    cache.set(KEY, revision - 1, "stale");
    leftovers.push(...stored(revision));
    cache.set(KEY, revision, preview(revision));
    cache.set(KEY, 0, "stale");
    if (CHECKPOINTS.includes(revision)) {
      const previews = stored(revision);
      retained.push([previews.length, previews.join("").length]);
    }
  }
  expect(retained).toEqual(
    CHECKPOINTS.map((revision) => [1, preview(revision).length]),
  );
  expect(leftovers).toEqual([]);
  expect(cache.get(KEY, 100)).toBe(preview(100));
});
