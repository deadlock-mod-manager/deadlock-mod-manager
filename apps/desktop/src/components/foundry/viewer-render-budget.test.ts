import { expect, test } from "bun:test";
import {
  createViewerFrameBudget,
  createViewerDrawBudget,
  viewerPixelRatio,
} from "./viewer-render-budget";

test("busy viewers take turns submitting WebGL work within browser frames", () => {
  const budget = createViewerDrawBudget();
  const first = budget.createSlot();
  const second = budget.createSlot();
  const draws = [0, 0];
  for (let frame = 0; frame < 120; frame++) {
    const now = frame * (1000 / 60);
    const submitted = [first.ready(now), second.ready(now)];
    expect(submitted.filter(Boolean)).toHaveLength(1);
    submitted.forEach((ready, index) => {
      if (ready) draws[index]++;
    });
  }
  expect(draws).toEqual([60, 60]);
});

test("paused, hidden or disposed views release their pending turn", () => {
  const budget = createViewerDrawBudget();
  const active = budget.createSlot();
  const paused = budget.createSlot();
  expect(active.ready(0)).toBe(true);
  expect(paused.ready(0)).toBe(false);
  paused.idle();
  for (let frame = 1; frame <= 60; frame++)
    expect(active.ready(frame * (1000 / 60))).toBe(true);
  expect(paused.ready(60 * (1000 / 60))).toBe(false);
  expect(active.ready(1017)).toBe(false);
  paused.idle();
  expect(active.ready(1034)).toBe(true);
});

test("three simultaneous views share turns in request order", () => {
  const budget = createViewerDrawBudget();
  const views = Array.from({ length: 3 }, () => budget.createSlot());
  const draws = [0, 0, 0];
  for (let frame = 0; frame < 90; frame++) {
    const submitted = views.map((view) => view.ready(frame * (1000 / 60)));
    expect(submitted.filter(Boolean)).toHaveLength(1);
    submitted.forEach((ready, index) => {
      if (ready) draws[index]++;
    });
  }
  expect(draws).toEqual([30, 30, 30]);
});

test("automatic resolution bounds large HiDPI targets without upscaling small previews", () => {
  expect(viewerPixelRatio(640, 480, 1, "auto")).toBe(1);
  expect(viewerPixelRatio(640, 480, 2, "auto")).toBe(2);
  const ratio = viewerPixelRatio(3840, 2160, 2, "auto");
  expect(3840 * 2160 * ratio * ratio).toBeCloseTo(2_073_600, 3);
  expect(viewerPixelRatio(3840, 2160, 2, "native")).toBe(2);
  expect(viewerPixelRatio(3840, 2160, 2, "half")).toBe(1);
});

test("frame pacing limits high-refresh rendering while preserving elapsed simulation time", () => {
  const budget = createViewerFrameBudget();
  let frames = 0;
  let elapsed = 0;
  let previous = 0;
  for (let tick = 0; tick < 144; tick++) {
    const now = (tick * 1000) / 144;
    if (!budget.ready(now)) continue;
    frames++;
    elapsed += now - previous;
    previous = now;
  }
  expect(frames).toBe(60);
  expect(elapsed).toBeGreaterThan(975);
  expect(budget.ready(previous + 1, true)).toBe(true);
  expect(budget.ready(previous + 2)).toBe(false);
  expect(budget.ready(previous + 5000)).toBe(true);
});
