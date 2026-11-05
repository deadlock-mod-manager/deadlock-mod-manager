import { expect, test } from "bun:test";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { snapViewerCamera } from "./viewer-camera-snap";
import { createViewerModelOrientation } from "./viewer-model-orientation";

test("axis snaps consume orbit inertia, retain the target and keep the orbit up-axis", () => {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(3, 2, 5);
  const controls = new OrbitControls(camera);
  controls.target.set(1, 1, 0);
  controls.enableDamping = true;
  controls.autoRotate = true;
  controls.update(1 / 60);
  controls.autoRotate = false;
  const target = controls.target.clone(),
    distance = camera.position.distanceTo(target);
  snapViewerCamera(camera, controls, new THREE.Vector3(-1, 0, 0));
  for (let i = 0; i < 30; i++) controls.update();
  expect(controls.target.distanceTo(target)).toBeLessThan(1e-8);
  expect(
    camera.position.distanceTo(
      target.clone().add(new THREE.Vector3(-distance, 0, 0)),
    ),
  ).toBeLessThan(1e-6);
  snapViewerCamera(camera, controls, new THREE.Vector3(0, 1, 0));
  expect(camera.up.toArray()).toEqual([0, 1, 0]);
  expect(camera.quaternion.toArray().every(Number.isFinite)).toBe(true);
  expect(camera.position.distanceTo(controls.target)).toBeCloseTo(distance);
});

test("the model heading uses animated root orientation rather than its bind frame", () => {
  const root = new THREE.Group(),
    bone = new THREE.Bone();
  bone.name = "root_motion";
  bone.rotation.y = Math.PI / 2;
  const mesh = new THREE.SkinnedMesh(
    new THREE.BufferGeometry(),
    new THREE.MeshBasicMaterial(),
  );
  root.add(mesh, bone);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton([bone]));
  const staticOrientation = createViewerModelOrientation(
    () => root,
    () => false,
  );
  expect(staticOrientation().angleTo(new THREE.Quaternion())).toBeLessThan(
    1e-6,
  );
  bone.rotation.set(0, 0, 0);
  const orientation = createViewerModelOrientation(
    () => root,
    () => true,
  );
  expect(orientation().angleTo(new THREE.Quaternion())).toBeLessThan(1e-6);
  bone.rotation.y += Math.PI / 3;
  expect(
    orientation().angleTo(
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        Math.PI / 3,
      ),
    ),
  ).toBeLessThan(1e-6);
  mesh.geometry.dispose();
  mesh.material.dispose();
});
