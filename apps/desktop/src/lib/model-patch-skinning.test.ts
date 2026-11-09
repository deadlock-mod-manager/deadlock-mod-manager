import { expect, test } from "bun:test";
import * as THREE from "three";
import type { ModdingModelPatch } from "@/types/generated/ModdingModelPatch";
import {
  createModelPatchMesh,
  syncModelPatchBind,
} from "./model-patch-skinning";

const patch: ModdingModelPatch = {
  id: "surface",
  image: "materials/dmm_images/source/original.gif",
  bone: "root",
  position: [0, 0, 0],
  rotation: [0, 0, 0, 1],
  size: [2, 2],
  shape: "conform",
  curvature: 0,
  contour: Array.from({ length: 169 }, () => 0),
  conformity: 1,
  thickness: 0.1,
  offset: 0,
  roughness: 0.75,
  glow: 0,
  crop: [0, 0, 1, 1],
  background: null,
};

test("surface stickers inherit mixed weights, bend with the host, and retain gizmo movement", () => {
  const root = new THREE.Group();
  const anchor = new THREE.Bone();
  anchor.name = "root";
  const limb = new THREE.Bone();
  limb.name = "limb";
  limb.position.x = 10;
  anchor.add(limb);
  root.add(anchor);
  root.updateMatrixWorld(true);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 0, 1, 0], 3),
  );
  geometry.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3),
  );
  geometry.setAttribute(
    "skinIndex",
    new THREE.Uint16BufferAttribute([0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0], 4),
  );
  geometry.setAttribute(
    "skinWeight",
    new THREE.Float32BufferAttribute(
      [1, 0, 0, 0, 0.25, 0.75, 0, 0, 0.5, 0.5, 0, 0],
      4,
    ),
  );
  const material = new THREE.MeshStandardMaterial();
  material.userData.sourceMaterial = "materials/surface.vmat";
  const host = new THREE.SkinnedMesh(geometry, material);
  root.add(host);
  host.bind(new THREE.Skeleton([anchor, limb]), new THREE.Matrix4());
  const sticker = createModelPatchMesh(
    root,
    "materials/surface.vmat",
    patch,
    new THREE.MeshStandardMaterial(),
  );
  expect(sticker instanceof THREE.SkinnedMesh).toBe(true);
  anchor.add(sticker);
  syncModelPatchBind(sticker);
  root.updateMatrixWorld(true);
  const right = 12;
  const center = 6 * 13 + 6;
  const centerBefore = sticker
    .getVertexPosition(center, new THREE.Vector3())
    .applyMatrix4(sticker.matrixWorld);
  const before = sticker
    .getVertexPosition(right, new THREE.Vector3())
    .applyMatrix4(sticker.matrixWorld);
  limb.position.z = 2;
  root.updateMatrixWorld(true);
  const after = sticker
    .getVertexPosition(right, new THREE.Vector3())
    .applyMatrix4(sticker.matrixWorld);
  expect(after.z - before.z).toBeCloseTo(1.5);
  const centerAfter = sticker
    .getVertexPosition(center, new THREE.Vector3())
    .applyMatrix4(sticker.matrixWorld);
  // Halfway along the edge: blend both endpoints, rather than snapping to one.
  expect(centerAfter.z - centerBefore.z).toBeCloseTo(0.75);
  expect(sticker.geometry.getAttribute("skinIndex").getX(center + 169)).toBe(
    sticker.geometry.getAttribute("skinIndex").getX(center),
  );
  for (let slot = 0; slot < 4; slot++)
    expect(
      sticker.geometry
        .getAttribute("skinWeight")
        .getComponent(center + 169, slot),
    ).toBe(
      sticker.geometry.getAttribute("skinWeight").getComponent(center, slot),
    );
  sticker.position.x = 0.5;
  syncModelPatchBind(sticker);
  root.updateMatrixWorld(true);
  const moved = sticker
    .getVertexPosition(right, new THREE.Vector3())
    .applyMatrix4(sticker.matrixWorld);
  expect(moved.x - after.x).toBeCloseTo(0.5);
  const rigid = createModelPatchMesh(
    root,
    "materials/surface.vmat",
    { ...patch, shape: "flat" },
    material,
  );
  expect(rigid instanceof THREE.SkinnedMesh).toBe(false);
});

test("unskinned surfaces retain rigid attachments without requiring named body parts", () => {
  const mesh = createModelPatchMesh(
    new THREE.Group(),
    "materials/weapon.vmat",
    patch,
    new THREE.MeshStandardMaterial(),
  );
  expect(mesh instanceof THREE.SkinnedMesh).toBe(false);
});
