import { expect, test } from "bun:test";
import { createGpuFrameTimer, type GpuTimerContext } from "./gpu-frame-timer";

test("GPU timer bounds queries, never reads unavailable results, discards disjoint timings and disposes", () => {
  let available = false,
    disjoint = false,
    resultReads = 0,
    allocated = 0,
    deleted = 0;
  const context: GpuTimerContext = {
    QUERY_RESULT_AVAILABLE: 1,
    QUERY_RESULT: 2,
    getExtension: () => ({ TIME_ELAPSED_EXT: 3, GPU_DISJOINT_EXT: 4 }),
    createQuery: () => {
      allocated += 1;
      return {};
    },
    deleteQuery: () => {
      deleted += 1;
    },
    beginQuery() {},
    endQuery() {},
    isContextLost: () => false,
    getParameter: () => disjoint,
    getQueryParameter: (_query, name) => {
      if (name === 1) return available;
      resultReads += 1;
      return 2_500_000;
    },
  };
  const timer = createGpuFrameTimer(context);
  if (!timer) throw new Error("Expected timer");
  for (let frame = 0; frame < 4; frame += 1) {
    expect(timer.begin(frame)).toBe(true);
    expect(timer.begin(frame)).toBe(false);
    timer.end();
  }
  expect(timer.begin(4)).toBe(false);
  expect(timer.poll()).toBeNull();
  expect(resultReads).toBe(0);
  available = true;
  expect(timer.poll()).toEqual({ frame: 0, milliseconds: 2.5 });
  expect(timer.begin(4)).toBe(true);
  timer.end();
  expect(allocated).toBe(4);
  disjoint = true;
  expect(timer.poll()).toBeNull();
  expect(deleted).toBe(4);
  disjoint = false;
  expect(timer.begin(5)).toBe(true);
  disjoint = true;
  expect(timer.poll()).toBeNull();
  timer.end();
  expect(deleted).toBe(5);
  disjoint = false;
  expect(timer.begin(6)).toBe(true);
  timer.dispose();
  timer.dispose();
  expect(deleted).toBe(6);
  expect(timer.begin(7)).toBe(false);
  expect(timer.poll()).toBeNull();
});
