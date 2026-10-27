import { expect, test } from "bun:test";
import { imageLocationCounts } from "./modding-image-locations";

test("misplaced images mark the file and each collapsed ancestor without crossing folder boundaries", () => {
  const counts = imageLocationCounts([
    "models/hero/icon.png",
    "models/hero/portrait.psd",
    "models_other/icon.png",
    "root.jpg",
  ]);
  expect(counts.get("models")).toBe(2);
  expect(counts.get("models/hero")).toBe(2);
  expect(counts.get("models/hero/icon.png")).toBe(1);
  expect(counts.get("models_other")).toBe(1);
  expect(counts.get("root.jpg")).toBe(1);
  expect(counts.has("model")).toBe(false);
  expect(imageLocationCounts([]).size).toBe(0);
});

test("rescanning after an image moves removes its former warnings", () => {
  const before = imageLocationCounts(["models/old.png", "models/old.png"]);
  expect(before.get("models")).toBe(1);
  const after = imageLocationCounts([]);
  expect(after.has("models")).toBe(false);
});
