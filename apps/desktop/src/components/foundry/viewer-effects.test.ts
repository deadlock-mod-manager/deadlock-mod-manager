import { expect, test } from "bun:test";
import { repeatViewerEffect } from "./viewer-effects";

test("loop wrappers split start and release boundaries and hide unstarted effects", () => {
  let age = 0,
    releases = 0,
    prepares = 0,
    visible = true;
  const deltas: number[] = [];
  const effect = repeatViewerEffect(
    {
      reset() {
        age = 0;
      },
      update(delta) {
        age += delta;
        deltas.push(delta);
      },
      release() {
        releases += 1;
      },
      prepare() {
        prepares += 1;
      },
      setVisible(value) {
        visible = value;
      },
      dispose() {},
    },
    4,
    1,
    2,
  );
  if (!effect) throw new Error("Expected effect");
  expect(visible).toBe(false);
  effect.update(0.5);
  effect.prepare?.();
  expect(prepares).toBe(0);
  effect.update(2);
  expect(visible).toBe(true);
  expect(age).toBe(1.5);
  expect(deltas).toEqual([1, 0.5]);
  expect(releases).toBe(1);
  effect.prepare?.();
  expect(prepares).toBe(1);
  effect.update(9);
  expect(age).toBe(2.5);
  expect(releases).toBe(2);
  effect.reset();
  expect(visible).toBe(false);
  effect.update(0);
  effect.prepare?.();
  expect(prepares).toBe(1);
});
