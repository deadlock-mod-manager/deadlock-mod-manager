import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/** Consume pending orbit/pan inertia before setting an exact view. Keep OrbitControls' Y-up frame. */
export function snapViewerCamera(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  direction: THREE.Vector3,
) {
  const damping = controls.enableDamping,
    rotating = controls.autoRotate;
  const target = controls.target.clone(),
    distance = camera.position.distanceTo(target);
  controls.enableDamping = false;
  controls.autoRotate = false;
  controls.update();
  controls.target.copy(target);
  camera.up.set(0, 1, 0);
  camera.position.copy(controls.target).addScaledVector(direction, distance);
  controls.update();
  controls.enableDamping = damping;
  controls.autoRotate = rotating;
}
