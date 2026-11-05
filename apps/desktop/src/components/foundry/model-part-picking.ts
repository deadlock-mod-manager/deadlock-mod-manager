import * as THREE from "three";
import { z } from "zod";

type PickingPointer = Pick<
  PointerEvent,
  | "button"
  | "pointerId"
  | "clientX"
  | "clientY"
  | "ctrlKey"
  | "shiftKey"
  | "altKey"
  | "metaKey"
>;
interface PickingSurface {
  getBoundingClientRect: () => {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  addEventListener: (
    name: string,
    listener: (event: PickingPointer) => void,
  ) => void;
  removeEventListener: (
    name: string,
    listener: (event: PickingPointer) => void,
  ) => void;
}

export function pickModelMaterial(
  root: THREE.Object3D,
  camera: THREE.Camera,
  pointer: THREE.Vector2,
): string | null {
  const ray = new THREE.Raycaster();
  ray.setFromCamera(pointer, camera);
  for (const hit of ray.intersectObject(root, true)) {
    if (
      !(hit.object instanceof THREE.Mesh) ||
      hit.object.userData.previewOutline
    )
      continue;
    let visible = true;
    for (
      let object: THREE.Object3D | null = hit.object;
      object;
      object = object.parent
    ) {
      if (!object.visible) visible = false;
    }
    if (!visible) continue;
    const material = Array.isArray(hit.object.material)
      ? hit.object.material[hit.face?.materialIndex ?? 0]
      : hit.object.material;
    if (!material?.visible) continue;
    const name = z.string().min(1).safeParse(material.userData.sourceMaterial);
    if (name.success) return name.data;
  }
  return null;
}

export function attachModelPartPicking(
  element: PickingSurface,
  camera: THREE.Camera,
  root: () => THREE.Object3D | null,
  pick: () => ((material: string) => void) | undefined,
  blocked: () => boolean = () => false,
) {
  let down: { x: number; y: number; pointer: number } | null = null;
  const start = (event: PickingPointer) => {
    down =
      !blocked() &&
      event.button === 0 &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey &&
      !event.metaKey
        ? { x: event.clientX, y: event.clientY, pointer: event.pointerId }
        : null;
  };
  const end = (event: PickingPointer) => {
    const start = down;
    down = null;
    const model = root();
    const onPick = pick();
    if (
      !start ||
      blocked() ||
      !model ||
      !onPick ||
      event.button !== 0 ||
      event.pointerId !== start.pointer ||
      Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4
    )
      return;
    const box = element.getBoundingClientRect();
    const material = pickModelMaterial(
      model,
      camera,
      new THREE.Vector2(
        ((event.clientX - box.left) / box.width) * 2 - 1,
        -((event.clientY - box.top) / box.height) * 2 + 1,
      ),
    );
    if (material) onPick(material);
  };
  const cancel = () => {
    down = null;
  };
  element.addEventListener("pointerdown", start);
  element.addEventListener("pointerup", end);
  element.addEventListener("pointercancel", cancel);
  return () => {
    element.removeEventListener("pointerdown", start);
    element.removeEventListener("pointerup", end);
    element.removeEventListener("pointercancel", cancel);
  };
}
