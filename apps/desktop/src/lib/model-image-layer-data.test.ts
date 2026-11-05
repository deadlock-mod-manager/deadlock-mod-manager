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

test("older webviews preserve frame pixels when native base64 methods are unavailable", () => {
  const decode = Object.getOwnPropertyDescriptor(Uint8Array, "fromBase64");
  if (!decode)
    throw new Error("Native base64 methods required by this fixture");
  Object.defineProperty(Uint8Array, "fromBase64", {
    value: undefined,
    configurable: true,
  });
  try {
    const rgba = new Uint8Array([0, 127, 128, 255]);
    Object.defineProperty(rgba, "toBase64", { value: undefined });
    const frames = [
      {
        rgba,
        width: 1,
        height: 1,
        durationMs: 90,
      },
    ];
    expect(decodeModelImageFrames(encodeModelImageFrames(frames))).toEqual(
      frames,
    );
  } finally {
    Object.defineProperty(Uint8Array, "fromBase64", decode);
  }
});
