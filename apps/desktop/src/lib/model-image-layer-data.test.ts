import { expect, test } from "bun:test";
import {
  decodeModelImageFrames,
  encodeModelImageFrames,
} from "./model-image-layer-data";

test("projection frame transfer preserves alpha, bytes, and animation timing across chunk boundaries", () => {
  const rgba = Uint8Array.from(
    { length: 256 * 256 * 4 },
    (_, index) => index % 256,
  );
  const frames = [
    { rgba, width: 256, height: 256, durationMs: 45 },
    {
      rgba: new Uint8Array([255, 0, 128, 0]),
      width: 1,
      height: 1,
      durationMs: 170,
    },
  ];
  expect(decodeModelImageFrames(encodeModelImageFrames(frames))).toEqual(
    frames,
  );
});
