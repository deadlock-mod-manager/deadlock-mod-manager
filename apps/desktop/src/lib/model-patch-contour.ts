import * as THREE from "three";
import type { ModdingModelPatch } from "@/types/generated/ModdingModelPatch";

const SEGMENTS = 12;
const SIDE = SEGMENTS + 1;

/** Rasterize the posed surface once when fitting, never during animation. */
export function fitModelPatchContour(
  root: THREE.Object3D,
  host: string,
  patch: ModdingModelPatch,
  parent: THREE.Matrix4,
): ModdingModelPatch {
  if (patch.shape !== "conform") return patch;
  const frame = new THREE.Matrix4().compose(
    new THREE.Vector3(...patch.position),
    new THREE.Quaternion(...patch.rotation),
    new THREE.Vector3(1, 1, 1),
  );
  const inverse = parent.clone().multiply(frame).invert();
  const heights = new Float64Array(SIDE * SIDE).fill(NaN);
  const point = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (
      !(object instanceof THREE.Mesh) ||
      object.userData.attachedPatch ||
      object.userData.previewOutline
    )
      return;
    for (
      let ancestor: THREE.Object3D | null = object;
      ancestor;
      ancestor = ancestor.parent
    )
      if (!ancestor.visible) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    const allowed = new Set(
      materials.flatMap((m, i) =>
        m.visible && m.userData.sourceMaterial === host ? [i] : [],
      ),
    );
    if (!allowed.size) return;
    const positions = object.geometry.getAttribute("position"),
      index = object.geometry.index;
    const projected = new Float32Array(positions.count * 3);
    const matrix = inverse.clone().multiply(object.matrixWorld);
    for (let i = 0; i < positions.count; i++) {
      object.getVertexPosition(i, point).applyMatrix4(matrix);
      projected[i * 3] = (point.x / patch.size[0] + 0.5) * SEGMENTS;
      projected[i * 3 + 1] = (point.y / patch.size[1] + 0.5) * SEGMENTS;
      projected[i * 3 + 2] = point.z;
    }
    const groups = object.geometry.groups.length
      ? object.geometry.groups
      : [
          {
            start: 0,
            count: index?.count ?? positions.count,
            materialIndex: 0,
          },
        ];
    for (const group of groups) {
      if (!allowed.has(group.materialIndex ?? 0)) continue;
      for (let i = group.start; i + 2 < group.start + group.count; i += 3) {
        const a = (index?.getX(i) ?? i) * 3,
          b = (index?.getX(i + 1) ?? i + 1) * 3,
          c = (index?.getX(i + 2) ?? i + 2) * 3;
        const ax = projected[a],
          ay = projected[a + 1],
          bx = projected[b],
          by = projected[b + 1],
          cx = projected[c],
          cy = projected[c + 1];
        const denominator = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
        if (Math.abs(denominator) < 1e-8) continue;
        const left = Math.max(0, Math.ceil(Math.min(ax, bx, cx))),
          right = Math.min(SEGMENTS, Math.floor(Math.max(ax, bx, cx)));
        const bottom = Math.max(0, Math.ceil(Math.min(ay, by, cy))),
          top = Math.min(SEGMENTS, Math.floor(Math.max(ay, by, cy)));
        for (let y = bottom; y <= top; y++)
          for (let x = left; x <= right; x++) {
            const u =
              ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / denominator;
            const v =
              ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / denominator;
            if (u < -1e-5 || v < -1e-5 || u + v > 1.00001) continue;
            const z =
              u * projected[a + 2] +
              v * projected[b + 2] +
              (1 - u - v) * projected[c + 2];
            const slot = y * SIDE + x;
            if (
              Math.abs(z) <= Math.max(...patch.size) &&
              (!Number.isFinite(heights[slot]) ||
                Math.abs(z) < Math.abs(heights[slot]))
            )
              heights[slot] = z;
          }
      }
    }
  });
  const valid = Array.from(heights.keys()).filter((i) =>
    Number.isFinite(heights[i]),
  );
  if (!valid.length) return { ...patch, contour: undefined };
  const contour = Array.from(heights, (height, i) => {
    if (Number.isFinite(height)) return height;
    let nearest = valid[0],
      distance = Infinity;
    for (const sample of valid) {
      const next =
        ((sample % SIDE) - (i % SIDE)) ** 2 +
        (Math.floor(sample / SIDE) - Math.floor(i / SIDE)) ** 2;
      if (next < distance) {
        nearest = sample;
        distance = next;
      }
    }
    return heights[nearest];
  });
  return { ...patch, contour };
}
