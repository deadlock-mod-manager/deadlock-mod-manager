import { expect, test } from "bun:test";
import * as THREE from "three";
import type { ModdingModelPatch } from "@/types/generated/ModdingModelPatch";
import { fitModelPatchContour } from "./model-patch-contour";
import { createModelPatchGeometry } from "./model-patch-geometry";
import { modelPatchBackground } from "./model-patch-background";

const patch: ModdingModelPatch = {
  id: "test",
  image: "materials/dmm_images/test.png",
  bone: "",
  position: [0, 0, 0],
  rotation: [0, 0, 0, 1],
  size: [20, 20],
  shape: "conform",
  curvature: 0,
  conformity: 1,
  offset: 0.3,
  thickness: 0,
  roughness: 0.7,
  glow: 0,
  crop: [0, 0, 1, 1],
  background: null,
};

test("surface fitting follows model contours in a transformed frame while preserving independent UVs", () => {
  const root = new THREE.Group();
  root.rotation.y = 0.3;
  root.position.set(3, 4, 5);
  const geometry = new THREE.PlaneGeometry(20, 20, 12, 12);
  const positions = geometry.getAttribute("position");
  for (let i = 0; i < positions.count; i++)
    positions.setZ(i, -0.02 * positions.getX(i) ** 2);
  const material = new THREE.MeshBasicMaterial();
  material.userData.sourceMaterial = "coat";
  root.add(new THREE.Mesh(geometry, material));
  root.updateMatrixWorld(true);
  const fitted = fitModelPatchContour(root, "coat", patch, root.matrixWorld);
  expect(fitted.contour?.length).toBe(169);
  expect(fitted.contour?.[0]).toBeCloseTo(-2);
  expect(fitted.contour?.[84]).toBeCloseTo(0);
  const mesh = createModelPatchGeometry(fitted);
  expect(mesh.boundingBox?.min.z).toBeCloseTo(-1.7);
  expect(mesh.boundingBox?.max.z).toBeCloseTo(0.3);
  const relaxed = createModelPatchGeometry({ ...fitted, conformity: 0 });
  expect(relaxed.boundingBox?.min.z).toBeCloseTo(0.3);
  expect(mesh.getAttribute("uv").array).toEqual(
    relaxed.getAttribute("uv").array,
  );
  expect(
    fitModelPatchContour(root, "other", patch, root.matrixWorld).contour,
  ).toBeUndefined();
  mesh.dispose();
  relaxed.dispose();
  geometry.dispose();
  material.dispose();
});

test("background removal preserves enclosed dark details and offers global keying explicitly", () => {
  const rgba = new Uint8Array(5 * 5 * 4);
  for (let i = 0; i < 25; i++) rgba[i * 4 + 3] = 255;
  for (let y = 1; y < 4; y++)
    for (let x = 1; x < 4; x++) rgba[(y * 5 + x) * 4] = 255;
  rgba[(2 * 5 + 2) * 4] = 0;
  const source = { width: 5, height: 5, rgba, durationMs: 100 };
  const key = { color: "#000000", tolerance: 0.02, softness: 0.02 };
  const edge = modelPatchBackground(source, key);
  expect(edge.rgba[3]).toBe(0);
  expect(edge.rgba[(2 * 5 + 2) * 4 + 3]).toBe(255);
  expect(source.rgba[3]).toBe(255);
  const global = modelPatchBackground(source, { ...key, edgeConnected: false });
  expect(global.rgba[(2 * 5 + 2) * 4 + 3]).toBe(0);
});
