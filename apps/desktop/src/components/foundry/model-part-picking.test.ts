import { expect, test } from "bun:test";
import * as THREE from "three";
import { pickModelMaterial } from "./model-part-picking";

test("picking resolves the hit material group and ignores hidden parts and outlines", () => {
  const root = new THREE.Group();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.z = 5;
  camera.updateMatrixWorld();
  const materials = Array.from({ length: 6 }, (_, index) => {
    const material = new THREE.MeshBasicMaterial();
    material.userData.sourceMaterial = `materials/face${index}.vmat`;
    return material;
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), materials);
  root.add(mesh);
  root.updateMatrixWorld(true);
  expect(pickModelMaterial(root, camera, new THREE.Vector2())).toBe(
    "materials/face4.vmat",
  );
  materials[4].visible = false;
  expect(pickModelMaterial(root, camera, new THREE.Vector2())).toBeNull();
  materials[4].visible = true;
  root.visible = false;
  expect(pickModelMaterial(root, camera, new THREE.Vector2())).toBeNull();
  root.visible = true;
  mesh.userData.previewOutline = true;
  expect(pickModelMaterial(root, camera, new THREE.Vector2())).toBeNull();
  mesh.geometry.dispose();
  for (const material of materials) material.dispose();
});
