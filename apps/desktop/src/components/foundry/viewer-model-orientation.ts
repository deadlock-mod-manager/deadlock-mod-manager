import * as THREE from "three";

export function createViewerModelOrientation(
  model: () => THREE.Object3D | null,
  animated: () => boolean,
) {
  let previous: THREE.Object3D | null = null;
  let motion: THREE.Bone | undefined;
  const rotation = new THREE.Quaternion();
  const forward = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  return () => {
    const root = model();
    if (root !== previous) {
      previous = root;
      motion = undefined;
      root?.traverse((object) => {
        if (
          !motion &&
          object instanceof THREE.Bone &&
          object.name === "root_motion"
        )
          motion = object;
      });
    }
    if (!root) return rotation.identity();
    (animated() ? (motion ?? root) : root).getWorldQuaternion(rotation);
    // Animation roots already describe model orientation. Inverse bind matrices
    // describe the skin's coordinate frame and would rotate the camera again.
    forward.set(1, 0, 0).applyQuaternion(rotation);
    return rotation.setFromAxisAngle(up, Math.atan2(-forward.z, forward.x));
  };
}
