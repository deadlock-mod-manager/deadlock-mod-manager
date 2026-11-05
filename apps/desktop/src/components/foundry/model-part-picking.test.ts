import { expect, test } from "bun:test";
import * as THREE from "three";
import {
  attachModelPartPicking,
  pickModelMaterial,
} from "./model-part-picking";

type PickingSurface = Parameters<typeof attachModelPartPicking>[0];
type PointerListener = Parameters<PickingSurface["addEventListener"]>[1];

class PickingSurfaceDouble implements PickingSurface {
  readonly listeners = new Map<string, PointerListener>();
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 100, height: 100 };
  }
  addEventListener(name: string, listener: PointerListener) {
    this.listeners.set(name, listener);
  }
  removeEventListener(name: string) {
    this.listeners.delete(name);
  }
  fire(name: string) {
    this.listeners.get(name)?.({
      clientX: 50,
      clientY: 50,
      pointerId: 1,
      button: 0,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false,
    });
  }
}

test("image placement blocks material picking until placement finishes", () => {
  const element = new PickingSurfaceDouble();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.z = 5;
  camera.updateMatrixWorld();
  const material = new THREE.MeshBasicMaterial();
  material.userData.sourceMaterial = "head.vmat";
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.updateMatrixWorld();
  const selected: string[] = [];
  let placing = true;
  const cleanup = attachModelPartPicking(
    element,
    camera,
    () => mesh,
    () => (value) => selected.push(value),
    () => placing,
  );
  element.fire("pointerdown");
  element.fire("pointerup");
  expect(selected).toEqual([]);
  placing = false;
  element.fire("pointerdown");
  placing = true;
  element.fire("pointerup");
  expect(selected).toEqual([]);
  placing = false;
  element.fire("pointerdown");
  element.fire("pointerup");
  expect(selected).toEqual(["head.vmat"]);
  cleanup();
  expect(element.listeners.size).toBe(0);
  mesh.geometry.dispose();
  material.dispose();
});

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
