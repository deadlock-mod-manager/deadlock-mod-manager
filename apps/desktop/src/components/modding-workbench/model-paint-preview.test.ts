import { expect, test } from "bun:test";
import { opaquePaintPreview } from "./model-paint-preview";

test("UV color remains visible when the source packs zero alpha without modifying export pixels", () => {
  const original = new Uint8Array([255, 40, 80, 0, 10, 20, 30, 73]);
  const display = opaquePaintPreview(original);
  expect(Array.from(display)).toEqual([255, 40, 80, 255, 10, 20, 30, 255]);
  expect(Array.from(original)).toEqual([255, 40, 80, 0, 10, 20, 30, 73]);
});
