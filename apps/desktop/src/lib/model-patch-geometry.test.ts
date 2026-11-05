import * as THREE from "three";
import { expect, test } from "bun:test";
import type { ModdingModelPatch } from "@/types/generated/ModdingModelPatch";
import {
  createModelPatchGeometry,
  modelPatchFrames,
  modelPatchTrim,
  modelPatchPose,
} from "./model-patch-geometry";

function fixture(): ModdingModelPatch {
  return {
    id: "test",
    image: "materials/dmm_images/test/original.png",
    bone: "spine",
    position: [0, 0, 0],
    rotation: [0, 0, 0, 1],
    size: [20, 10],
    shape: "flat",
    curvature: 0.5,
    thickness: 0,
    offset: 0.4,
    roughness: 0.7,
    glow: 0,
    crop: [0, 0, 1, 1],
    background: null,
  };
}
test("sticker meshes keep independent UVs, bounded geometry and the requested physical depth", () => {
  for (const shape of [
    "flat",
    "curve",
    "dome",
  ] satisfies ModdingModelPatch["shape"][]) {
    const geometry = createModelPatchGeometry({
      ...fixture(),
      shape,
      thickness: 0.5,
    });
    const position = geometry.getAttribute("position"),
      uv = geometry.getAttribute("uv");
    expect(position.count).toBeLessThanOrEqual(338);
    expect(geometry.boundingBox?.min.x).toBe(-10);
    expect(geometry.boundingBox?.max.x).toBe(10);
    expect(geometry.boundingBox?.min.z).toBeCloseTo(-0.1);
    expect(geometry.boundingBox?.max.z).toBeCloseTo(
      shape === "flat" ? 0.4 : 1.65,
    );
    for (let i = 0; i < position.count; i++) {
      expect(uv.getX(i)).toBeGreaterThanOrEqual(0);
      expect(uv.getX(i)).toBeLessThanOrEqual(1);
      expect(Number.isFinite(position.getZ(i))).toBe(true);
    }
    geometry.dispose();
  }
});
test("background removal respects authored alpha, edge softness and crop without changing the source", () => {
  const rgba = new Uint8Array([0, 0, 0, 255, 32, 32, 32, 128, 255, 0, 0, 255]);
  const original = rgba.slice();
  const patch = {
    ...fixture(),
    background: { color: "#000000", tolerance: 0.25, softness: 0.25 },
  };
  const frames = modelPatchFrames(
    [{ width: 3, height: 1, rgba, durationMs: 90 }],
    patch,
  );
  expect(frames[0].rgba[3]).toBe(0);
  expect(frames[0].rgba[7]).toBe(64);
  expect(frames[0].rgba[11]).toBe(255);
  expect(frames[0].durationMs).toBe(90);
  expect(rgba).toEqual(original);
  const cropped = modelPatchFrames(
    [{ width: 3, height: 1, rgba, durationMs: 90 }],
    { ...patch, crop: [1 / 3, 0, 1, 1] },
  );
  expect(cropped[0].width).toBe(2);
  expect(cropped[0].rgba[3]).toBe(64);
});

test("transparent trimming includes all animated frames and background removal", () => {
  const first = new Uint8Array(4 * 4 * 4);
  first[(1 * 4 + 1) * 4 + 3] = 255;
  const second = new Uint8Array(4 * 4 * 4);
  second[(2 * 4 + 2) * 4 + 3] = 255;
  const frames = [first, second].map((rgba) => ({
    width: 4,
    height: 4,
    rgba,
    durationMs: 100,
  }));
  expect(modelPatchTrim(frames, null)).toEqual([0.25, 0.25, 0.75, 0.75]);
  expect(
    modelPatchTrim(frames, { color: "#000000", tolerance: 0, softness: 0 }),
  ).toEqual([0, 0, 1, 1]);
  expect(modelPatchTrim([], null)).toEqual([0, 0, 1, 1]);
});

test("click placement aligns a full surface to the hit normal in a rotated bone frame", () => {
  const parent = new THREE.Matrix4().makeRotationY(0.7).setPosition(3, 4, 5);
  const point = new THREE.Vector3(5, 8, 10);
  for (const normal of [
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(1, 1, 1).normalize(),
  ]) {
    const pose = modelPatchPose(point, normal, parent);
    const local = new THREE.Matrix4().compose(
      new THREE.Vector3(...pose.position),
      new THREE.Quaternion(...pose.rotation),
      new THREE.Vector3(1, 1, 1),
    );
    const world = parent.clone().multiply(local);
    expect(
      new THREE.Vector3().setFromMatrixPosition(world).distanceTo(point),
    ).toBeLessThan(1e-6);
    expect(
      new THREE.Vector3(0, 0, 1).transformDirection(world).distanceTo(normal),
    ).toBeLessThan(1e-6);
    expect(Math.abs(world.determinant() - 1)).toBeLessThan(1e-6);
  }
});
