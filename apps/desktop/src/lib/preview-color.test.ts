import { expect, test } from "bun:test";
import { previewPixel, previewPixelHex } from "./preview-color";

test("preview picking converts CSS coordinates to bottom-left framebuffer pixels at high DPI", () => {
  const rect = { left: 100, top: 50, width: 200, height: 100 };
  expect(previewPixel(100, 50, rect, 400, 200)).toEqual({ x: 0, y: 199 });
  expect(previewPixel(200, 100, rect, 400, 200)).toEqual({ x: 200, y: 99 });
  expect(previewPixel(299, 149, rect, 400, 200)).toEqual({ x: 398, y: 1 });
  expect(previewPixel(300, 150, rect, 400, 200)).toBeNull();
  expect(previewPixel(99, 50, rect, 400, 200)).toBeNull();
  expect(previewPixel(100, 50, { ...rect, width: 0 }, 400, 200)).toBeNull();
});

test("preview picking rejects transparent pixels and preserves visible RGB values", () => {
  expect(previewPixelHex(new Uint8Array([71, 62, 189, 255]))).toBe("#473ebd");
  expect(previewPixelHex(new Uint8Array([0, 0, 0, 255]))).toBe("#000000");
  expect(previewPixelHex(new Uint8Array([71, 62, 189, 0]))).toBeNull();
  expect(previewPixelHex(new Uint8Array())).toBeNull();
});
