import { expect, test } from "bun:test";
import { modelPatchBackground } from "./model-patch-background";

const key = { color: "#000000", tolerance: 0.02, softness: 0.02 };
function image(width: number) {
  const rgba = new Uint8Array(width * width * 4);
  for (let i = 0; i < width * width; i++) rgba[i * 4 + 3] = 255;
  return { width, height: width, rgba, durationMs: 100 };
}

test("softness does not erase dark foreground or let background leak through it", () => {
  const source = image(5);
  for (let y = 1; y <= 3; y++)
    for (let x = 1; x <= 3; x++) source.rgba[(y * 5 + x) * 4] = 8;
  source.rgba[(2 * 5 + 2) * 4] = 0;
  const output = modelPatchBackground(source, key);
  expect(output.rgba[3]).toBe(0);
  expect(output.rgba[(1 * 5 + 1) * 4 + 3]).toBe(255);
  expect(output.rgba[(2 * 5 + 2) * 4 + 3]).toBe(255);
  expect(source.rgba[3]).toBe(255);
});

test("silhouette protection keeps dark interiors behind small gaps and can be disabled", () => {
  const source = image(100);
  for (let y = 30; y <= 70; y++)
    for (let x = 30; x <= 70; x++)
      if (x === 30 || x === 70 || y === 30 || y === 70)
        source.rgba[(y * 100 + x) * 4] = 255;
  source.rgba[(30 * 100 + 50) * 4] = 0;
  const protectedFrame = modelPatchBackground(source, key);
  const strict = modelPatchBackground(source, { ...key, gapProtection: 0 });
  const global = modelPatchBackground(source, { ...key, edgeConnected: false });
  expect(protectedFrame.rgba[(50 * 100 + 50) * 4 + 3]).toBe(255);
  expect(protectedFrame.rgba[3]).toBe(0);
  expect(strict.rgba[(50 * 100 + 50) * 4 + 3]).toBe(0);
  expect(global.rgba[(50 * 100 + 50) * 4 + 3]).toBe(0);
});

test("zero tolerance removes exact background even when softness is nonzero", () => {
  const source = image(3);
  source.rgba[4 * 4] = 1;
  const output = modelPatchBackground(source, { ...key, tolerance: 0 });
  expect(output.rgba[3]).toBe(0);
  expect(output.rgba[4 * 4 + 3]).toBe(255);
});
