import { expect, test } from "bun:test";
import { assignLabelRows } from "./scale-pins";

test("staggers close labels and hides the ones that still collide", () => {
  const rows = assignLabelRows(
    [
      { id: "c", position: 0.14 },
      { id: "a", position: 0.1 },
      { id: "b", position: 0.12 },
      { id: "far", position: 0.6 },
    ],
    0.1,
  );
  expect(Object.fromEntries(rows)).toEqual({
    a: 0,
    b: 1,
    c: null,
    far: 0,
  });
});
