import { expect, test } from "bun:test";
import { Object3D } from "three";
import { PreviewClock } from "@/lib/preview-clock";
import type { PreviewAnimation } from "@/types/generated/PreviewAnimation";
import { createComparisonPlayback } from "./comparison-playback";

const animation = (duration: number): PreviewAnimation => ({
  duration,
  times: [0, duration],
  segments: [],
  tracks: [
    {
      name: "root",
      positions: [0, 0, 0, 10, 0, 0],
      rotations: [0, 0, 0, 1, 0, 0, 0, 1],
      scales: [1, 1, 1, 1, 1, 1],
    },
  ],
});

test("stock and mod retain the same phase through speed, pause, seek and visibility toggles", () => {
  const mod = new Object3D();
  mod.name = "root";
  const stock = new Object3D();
  stock.name = "root";
  const modPlayback = createComparisonPlayback(mod);
  const stockPlayback = createComparisonPlayback(stock);
  modPlayback.setAnimation(animation(2), 0, 2);
  stockPlayback.setAnimation(animation(4), 0, 2);
  const clock = new PreviewClock(
    () => {
      modPlayback.reset();
      stockPlayback.reset();
    },
    (delta) => {
      modPlayback.update(delta);
      stockPlayback.update(delta);
    },
  );
  for (let frame = 0; frame < 15; frame++) clock.tick(1 / 60, true, 2);
  expect(mod.position.x).toBeCloseTo(2.5);
  expect(stock.position.x).toBeCloseTo(mod.position.x);
  mod.visible = false;
  stock.visible = true;
  for (let frame = 0; frame < 15; frame++) clock.tick(1 / 60, false, 2);
  expect(stock.position.x).toBeCloseTo(2.5);
  clock.seek(1.5);
  for (let frame = 0; frame < 100 && clock.seeking; frame++)
    clock.tick(0, false, 1);
  mod.visible = true;
  stock.visible = false;
  expect(mod.position.x).toBeCloseTo(7.5);
  expect(stock.position.x).toBeCloseTo(mod.position.x);
  modPlayback.dispose();
  stockPlayback.dispose();
});

test("a late stock decode joins the current phase without restarting the transport", () => {
  const stock = new Object3D();
  stock.name = "root";
  const playback = createComparisonPlayback(stock);
  playback.setAnimation(animation(4), 0.75, 2);
  expect(stock.position.x).toBeCloseTo(3.75);
  playback.dispose();
});
