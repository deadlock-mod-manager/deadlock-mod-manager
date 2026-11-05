import { expect, test } from "bun:test";
import { Quaternion, Vector3 } from "three";
import {
  createViewerAxisProjection,
  pickViewerAxis,
} from "./viewer-axis-projection";

test("axis projection ignores quaternion roundoff during zoom but follows real camera rotation", () => {
  const projection = createViewerAxisProjection();
  const rotation = new Quaternion();
  expect(projection.update(rotation)).toBe(true);
  expect(
    projection.update(
      rotation.clone().setFromAxisAngle(new Vector3(0, 1, 0), 1e-7),
    ),
  ).toBe(false);
  expect(
    projection.update(
      rotation.clone().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2),
    ),
  ).toBe(true);
  const forward = projection.axes.find((a) => a.label === "Z")!;
  expect(forward.projected.x).toBeCloseTo(-1);
  expect(forward.projected.z).toBeCloseTo(0);
});

test("axis picking follows visible depth order and rejects empty space", () => {
  const projection = createViewerAxisProjection();
  projection.update(new Quaternion());
  expect(pickViewerAxis(projection.axes, 0, 0)?.toArray()).toEqual([0, 0, 1]);
  expect(pickViewerAxis(projection.axes, 1, 0)?.toArray()).toEqual([1, 0, 0]);
  expect(pickViewerAxis(projection.axes, 1.5, 1.5)).toBeNull();
  projection.update(
    new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI),
  );
  expect(pickViewerAxis(projection.axes, 0, 0)?.toArray()).toEqual([0, 0, -1]);
});
