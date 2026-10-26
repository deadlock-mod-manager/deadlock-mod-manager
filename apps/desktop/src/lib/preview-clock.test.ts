import { expect, test } from "bun:test";
import { PreviewClock } from "./preview-clock";

test("pause freezes simulation and speed applies to every step", () => {
  let elapsed = 0;
  const clock = new PreviewClock(
    () => {
      elapsed = 0;
    },
    (delta) => {
      elapsed += delta;
    },
  );
  clock.tick(1 / 60, false, 1);
  expect(elapsed).toBe(0);
  clock.tick(1 / 60, true, 2);
  expect(elapsed).toBeCloseTo(1 / 30);
});

test("seeking reconstructs from zero while paused and stays bounded per tick", () => {
  let steps = 0;
  let resets = 0;
  const clock = new PreviewClock(
    () => {
      resets += 1;
    },
    () => {
      steps += 1;
    },
  );
  clock.seek(5);
  clock.tick(0, false, 1);
  expect(steps).toBeLessThanOrEqual(120);
  for (let i = 0; i < 100 && clock.seeking; i += 1) clock.tick(0, false, 1);
  expect(clock.time).toBeCloseTo(5);
  expect(resets).toBe(1);
  clock.seek(0.25);
  for (let i = 0; i < 100 && clock.seeking; i += 1) clock.tick(0, false, 1);
  expect(clock.time).toBeCloseTo(0.25);
  expect(resets).toBe(2);
});
