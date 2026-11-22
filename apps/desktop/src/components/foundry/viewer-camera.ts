import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export const createViewerCamera = (
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  canvas: HTMLCanvasElement,
  model: () => THREE.Object3D | null,
) => {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const surfaces = () => {
    const meshes: THREE.Mesh[] = [];
    model()?.traverse((object) => {
      if (
        object instanceof THREE.Mesh &&
        object.visible &&
        !object.userData.previewOutline
      ) {
        if (object instanceof THREE.SkinnedMesh) {
          object.computeBoundingBox();
          object.computeBoundingSphere();
        }
        meshes.push(object);
      }
    });
    return meshes;
  };
  const fit = () => {
    const root = model();
    if (!root) return;
    root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    for (const mesh of surfaces()) {
      const bounds =
        mesh instanceof THREE.SkinnedMesh
          ? mesh.boundingBox
          : mesh.geometry.boundingBox;
      if (bounds) box.union(bounds.clone().applyMatrix4(mesh.matrixWorld));
      else box.expandByObject(mesh);
    }
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const radius = Math.max(sphere.radius, 0.01);
    const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    // Source models face +X; fit their projected box rather than a sphere so
    // wide viewports keep a useful amount of the character on screen.
    const direction = new THREE.Vector3(1, 0.04, 0.18).normalize();
    const right = new THREE.Vector3(0, 1, 0).cross(direction).normalize();
    const up = direction.clone().cross(right).normalize();
    const tangent = Math.tan(halfFov);
    let distance = 0;
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          const corner = new THREE.Vector3(x, y, z).sub(sphere.center);
          const depth = corner.dot(direction);
          distance = Math.max(
            distance,
            depth + Math.abs(corner.dot(up)) / tangent,
            depth + Math.abs(corner.dot(right)) / (tangent * camera.aspect),
          );
        }
      }
    }
    distance *= 1.08;
    controls.target.copy(sphere.center);
    camera.up.set(0, 1, 0);
    camera.position.copy(sphere.center).addScaledVector(direction, distance);
    camera.near = Math.max(radius / 2000, 0.01);
    camera.far = Math.max(distance * 25, radius * 50);
    camera.updateProjectionMatrix();
    controls.minDistance = radius * 0.015;
    controls.maxDistance = distance * 20;
    controls.update();
    controls.saveState();
  };
  const focus = (event: MouseEvent) => {
    const root = model();
    if (!root) return;
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      1 - ((event.clientY - rect.top) / rect.height) * 2,
    );
    raycaster.setFromCamera(pointer, camera);
    root.updateMatrixWorld(true);
    const hit = raycaster.intersectObjects(surfaces(), false)[0];
    if (!hit) return;
    const offset = camera.position.clone().sub(controls.target);
    controls.target.copy(hit.point);
    camera.position.copy(hit.point).add(offset);
    controls.update();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key.toLowerCase() === "f" || event.key.toLowerCase() === "r") {
      event.preventDefault();
      fit();
    }
  };
  canvas.tabIndex = 0;
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.zoomToCursor = true;
  controls.listenToKeyEvents(canvas);
  canvas.addEventListener("dblclick", focus);
  canvas.addEventListener("keydown", onKey);
  return {
    fit,
    dispose() {
      controls.stopListenToKeyEvents();
      canvas.removeEventListener("dblclick", focus);
      canvas.removeEventListener("keydown", onKey);
    },
  };
};
