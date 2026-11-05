import { expect, test } from "bun:test";
import { modelPaintFrameAt } from "./model-paint-animation";
const frames = [
  { pixels: new Uint8Array(), durationMs: 30 },
  { pixels: new Uint8Array(), durationMs: 90 },
];
test("GIF preview respects uneven durations, looping and finite stopping", () => {
  expect(modelPaintFrameAt({ frames, plays: 0 }, 0.029)).toBe(0);
  expect(modelPaintFrameAt({ frames, plays: 0 }, 0.03)).toBe(1);
  expect(modelPaintFrameAt({ frames, plays: 0 }, 0.121)).toBe(0);
  expect(modelPaintFrameAt({ frames, plays: 2 }, 0.241)).toBe(1);
  expect(modelPaintFrameAt({ frames, plays: 0 }, -1)).toBe(0);
});
