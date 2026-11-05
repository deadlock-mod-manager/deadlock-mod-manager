import * as THREE from "three";
import type { ModdingModelPatch } from "@/types/generated/ModdingModelPatch";
import type { ModelImageProjectionFrame } from "./model-image-projection";
import { modelPatchBackground } from "./model-patch-background";
import { cropModelImageFrames } from "./model-image-placement";

export function createModelPatchGeometry(patch: ModdingModelPatch) {
  const columns = patch.shape === "flat" ? 1 : 12;
  const rows = patch.shape === "dome" || patch.shape === "conform" ? 12 : 1;
  const rise = patch.curvature * Math.min(...patch.size) * 0.25;
  const positions: number[] = [],
    normals: number[] = [],
    uv: number[] = [],
    indices: number[] = [];
  for (let y = 0; y <= rows; y++)
    for (let x = 0; x <= columns; x++) {
      const u = x / columns,
        v = y / rows;
      const curved = patch.shape !== "flat",
        dome = patch.shape === "dome" || patch.shape === "conform";
      let z = curved
        ? rise * (1 - (u * 2 - 1) ** 2) * (dome ? 1 - (v * 2 - 1) ** 2 : 1)
        : 0;
      let dx = curved
        ? ((-4 * rise * (u * 2 - 1)) / patch.size[0]) *
          (dome ? 1 - (v * 2 - 1) ** 2 : 1)
        : 0;
      let dy = dome
        ? ((-4 * rise * (v * 2 - 1)) / patch.size[1]) * (1 - (u * 2 - 1) ** 2)
        : 0;
      const contour = (x: number, y: number) =>
        patch.shape === "conform"
          ? (patch.contour?.[y * 13 + x] ?? 0) * (patch.conformity ?? 1)
          : 0;
      const left = Math.max(0, x - 1),
        right = Math.min(columns, x + 1),
        bottom = Math.max(0, y - 1),
        top = Math.min(rows, y + 1);
      z += contour(x, y);
      dx +=
        (contour(right, y) - contour(left, y)) /
        (((right - left) * patch.size[0]) / columns);
      dy +=
        (contour(x, top) - contour(x, bottom)) /
        (((top - bottom) * patch.size[1]) / rows);
      positions.push(
        (u - 0.5) * patch.size[0],
        (v - 0.5) * patch.size[1],
        z + patch.offset,
      );
      normals.push(...new THREE.Vector3(-dx, -dy, 1).normalize().toArray());
      uv.push(u, 1 - v);
    }
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < columns; x++) {
      const a = y * (columns + 1) + x,
        b = a + 1,
        c = a + columns + 1;
      indices.push(a, b, c, b, c + 1, c);
    }
  if (patch.thickness > 0) {
    const count = positions.length / 3,
      frontIndices = [...indices];
    for (let i = 0; i < count; i++) {
      positions.push(
        positions[i * 3],
        positions[i * 3 + 1],
        positions[i * 3 + 2] - patch.thickness,
      );
      normals.push(-normals[i * 3], -normals[i * 3 + 1], -normals[i * 3 + 2]);
      uv.push(uv[i * 2], uv[i * 2 + 1]);
    }
    for (let i = 0; i < frontIndices.length; i += 3)
      indices.push(
        frontIndices[i] + count,
        frontIndices[i + 2] + count,
        frontIndices[i + 1] + count,
      );
    const edges: [number, number][] = [];
    for (let x = 0; x < columns; x++) {
      edges.push([x, x + 1]);
      const a = rows * (columns + 1) + x;
      edges.push([a + 1, a]);
    }
    for (let y = 0; y < rows; y++) {
      const a = y * (columns + 1);
      edges.push([a + columns + 1, a], [a + columns, a + 2 * columns + 1]);
    }
    for (const [a, b] of edges)
      indices.push(a, a + count, b, b, a + count, b + count);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function modelPatchFrames(
  frames: readonly ModelImageProjectionFrame[],
  patch: Pick<ModdingModelPatch, "background" | "crop">,
) {
  const key = patch.background;
  const keyed = key
    ? frames.map((frame) => modelPatchBackground(frame, key))
    : frames;
  const [left, top, right, bottom] = patch.crop;
  return cropModelImageFrames(keyed, { left, top, right, bottom });
}

export function modelPatchTrim(
  frames: readonly ModelImageProjectionFrame[],
  background: ModdingModelPatch["background"],
): ModdingModelPatch["crop"] {
  const keyed = modelPatchFrames(frames, { background, crop: [0, 0, 1, 1] });
  const first = keyed[0];
  if (!first) return [0, 0, 1, 1];
  let left = first.width,
    top = first.height,
    right = 0,
    bottom = 0;
  for (const frame of keyed)
    for (let y = 0; y < frame.height; y++)
      for (let x = 0; x < frame.width; x++) {
        if (frame.rgba[(y * frame.width + x) * 4 + 3] < 26) continue;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x + 1);
        bottom = Math.max(bottom, y + 1);
      }
  return right > left && bottom > top
    ? [
        left / first.width,
        top / first.height,
        right / first.width,
        bottom / first.height,
      ]
    : [0, 0, 1, 1];
}

export function modelPatchPose(
  point: THREE.Vector3,
  normal: THREE.Vector3,
  parent: THREE.Matrix4,
): Pick<ModdingModelPatch, "position" | "rotation"> {
  const up =
    Math.abs(normal.y) > 0.95
      ? new THREE.Vector3(0, 0, 1)
      : new THREE.Vector3(0, 1, 0);
  const right = up.clone().cross(normal).normalize();
  up.copy(normal).cross(right).normalize();
  const matrix = new THREE.Matrix4()
    .makeBasis(right, up, normal)
    .setPosition(point)
    .premultiply(parent.clone().invert());
  const position = new THREE.Vector3(),
    rotation = new THREE.Quaternion(),
    scale = new THREE.Vector3();
  matrix.decompose(position, rotation, scale);
  rotation.normalize();
  return {
    position: [position.x, position.y, position.z],
    rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
  };
}
