import {
  Color,
  Float32BufferAttribute,
  type Object3D,
  type PerspectiveCamera,
  Raycaster,
  Vector2,
  Vector3,
} from "three";
import {
  createSourceGeometryOverlay,
  type GeometryPreviewControls,
  updateSourceGeometryPreview,
} from "./source-geometry-edit";

export function installSourceGeometryPreview(
  element: HTMLElement,
  camera: PerspectiveCamera,
  root: Object3D,
  initial: GeometryPreviewControls,
) {
  let controls = initial;
  let previousEdits: GeometryPreviewControls["edits"] | null = null;
  let previousMeshes: GeometryPreviewControls["meshes"] | null = null;
  const overlay = createSourceGeometryOverlay(initial.meshes);
  const colors = new Float32Array(overlay.vertices.length * 3);
  overlay.points.geometry.setAttribute(
    "color",
    new Float32BufferAttribute(colors, 3),
  );
  overlay.points.material.vertexColors = true;
  overlay.points.material.color.set(0xffffff);
  root.add(overlay.points);
  let down: { x: number; y: number; pointer: number } | null = null;
  const update = (next: GeometryPreviewControls) => {
    controls = next;
    const unchanged =
      previousMeshes === next.meshes &&
      previousEdits?.length === next.edits.length &&
      previousEdits.every((edit, index) => {
        const other = next.edits[index];
        return (
          edit.state === other.state &&
          edit.vertex === other.vertex &&
          edit.position.every((value, axis) => value === other.position[axis])
        );
      });
    if (!unchanged) {
      overlay.update(next.edits);
      updateSourceGeometryPreview(root, next.meshes, next.edits);
      previousEdits = next.edits;
      previousMeshes = next.meshes;
    }
    const selected = new Set(
      next.selected.map((vertex) => `${vertex.state}:${vertex.vertex}`),
    );
    const attribute = overlay.points.geometry.getAttribute("color");
    const active = new Color(0xffbd69);
    const idle = new Color(0x7194a6);
    for (const [index, vertex] of overlay.vertices.entries()) {
      const color = selected.has(`${vertex.state}:${vertex.vertex}`)
        ? active
        : idle;
      attribute.setXYZ(index, color.r, color.g, color.b);
    }
    attribute.needsUpdate = true;
  };
  const start = (event: PointerEvent) => {
    down =
      event.button === 0
        ? { x: event.clientX, y: event.clientY, pointer: event.pointerId }
        : null;
  };
  const end = (event: PointerEvent) => {
    const start = down;
    down = null;
    if (
      !start ||
      event.button !== 0 ||
      start.pointer !== event.pointerId ||
      Math.hypot(start.x - event.clientX, start.y - event.clientY) > 4
    )
      return;
    const box = element.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const ray = new Raycaster();
    ray.params.Points.threshold =
      (camera.position.distanceTo(root.getWorldPosition(new Vector3())) *
        Math.tan((camera.fov * Math.PI) / 360) *
        12) /
      box.height;
    ray.setFromCamera(
      new Vector2(
        ((event.clientX - box.left) / box.width) * 2 - 1,
        (-(event.clientY - box.top) / box.height) * 2 + 1,
      ),
      camera,
    );
    const hit = ray.intersectObject(overlay.points)[0];
    const vertex =
      hit?.index === undefined ? undefined : overlay.vertices[hit.index];
    if (vertex)
      controls.onPick(vertex, event.shiftKey || event.ctrlKey || event.metaKey);
  };
  const cancel = () => {
    down = null;
  };
  element.addEventListener("pointerdown", start);
  element.addEventListener("pointerup", end);
  element.addEventListener("pointercancel", cancel);
  update(initial);
  return {
    update,
    dispose() {
      element.removeEventListener("pointerdown", start);
      element.removeEventListener("pointerup", end);
      element.removeEventListener("pointercancel", cancel);
      root.remove(overlay.points);
      updateSourceGeometryPreview(root, initial.meshes, []);
      overlay.dispose();
    },
  };
}
