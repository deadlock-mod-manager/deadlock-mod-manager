import * as THREE from "three";
import type { ModdingModelPatch } from "@/types/generated/ModdingModelPatch";
import { createModelPatchGeometry } from "./model-patch-geometry";

const anchors = new WeakMap<THREE.SkinnedMesh, THREE.Matrix4>();

/** Keep gizmo transforms effective while the skinned draw removes its parent transform. */
export function syncModelPatchBind(mesh: THREE.Mesh) {
  if (!(mesh instanceof THREE.SkinnedMesh)) return;
  const anchor = anchors.get(mesh);
  if (!anchor) return;
  mesh.updateMatrix();
  mesh.bindMatrix.copy(anchor).multiply(mesh.matrix);
}

export function createModelPatchMesh(
  root: THREE.Object3D,
  host: string,
  patch: ModdingModelPatch,
  material: THREE.MeshStandardMaterial,
): THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
  const geometry = createModelPatchGeometry(patch);
  const candidates: THREE.SkinnedMesh[] = [];
  if (patch.shape === "conform" && patch.bone)
    root.traverse((object) => {
      if (
        !(object instanceof THREE.SkinnedMesh) ||
        object.userData.attachedPatch
      )
        return;
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      if (materials.some((m) => m.userData.sourceMaterial === host))
        candidates.push(object);
    });
  const source = candidates[0];
  const anchorIndex =
    source?.skeleton.bones.findIndex((bone) => bone.name === patch.bone) ?? -1;
  if (!source || anchorIndex < 0) return new THREE.Mesh(geometry, material);
  const anchor = source.skeleton.boneInverses[anchorIndex].clone().invert();
  const pose = new THREE.Matrix4().compose(
    new THREE.Vector3(...patch.position),
    new THREE.Quaternion(...patch.rotation),
    new THREE.Vector3(1, 1, 1),
  );
  const bind = anchor.clone().multiply(pose);
  const surface: {
    position: THREE.Vector3;
    bones: number[];
    weights: number[];
  }[] = [];
  const triangles: [number, number, number][] = [];
  for (const object of candidates) {
    const positions = object.geometry.getAttribute("position");
    const joints = object.geometry.getAttribute("skinIndex");
    const weights = object.geometry.getAttribute("skinWeight");
    if (!joints || !weights) continue;
    const remap = object.skeleton.bones.map((bone) =>
      source.skeleton.bones.indexOf(bone),
    );
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    const allowed = new Set(
      materials.flatMap((m, i) =>
        m.userData.sourceMaterial === host ? [i] : [],
      ),
    );
    const index = object.geometry.getIndex();
    const vertices = new Set<number>();
    if (object.geometry.groups.length)
      for (const group of object.geometry.groups) {
        if (!allowed.has(group.materialIndex ?? 0)) continue;
        for (let i = group.start; i < group.start + group.count; i++)
          vertices.add(index ? index.getX(i) : i);
      }
    else if (index)
      for (let i = 0; i < index.count; i++) vertices.add(index.getX(i));
    else for (let i = 0; i < positions.count; i++) vertices.add(i);
    const offsets = new Map<number, number>();
    for (const i of vertices) {
      const bones = [0, 1, 2, 3].map(
        (slot) => remap[joints.getComponent(i, slot)],
      );
      const values = [0, 1, 2, 3].map((slot) => weights.getComponent(i, slot));
      if (bones.some((bone, slot) => bone < 0 && values[slot] > 0)) continue;
      offsets.set(i, surface.length);
      surface.push({
        position: new THREE.Vector3()
          .fromBufferAttribute(positions, i)
          .applyMatrix4(object.bindMatrix),
        bones: bones.map((bone) => Math.max(0, bone)),
        weights: values,
      });
    }
    const ranges = object.geometry.groups.length
      ? object.geometry.groups.filter((g) => allowed.has(g.materialIndex ?? 0))
      : [{ start: 0, count: index?.count ?? positions.count }];
    for (const range of ranges)
      for (let i = range.start; i + 2 < range.start + range.count; i += 3) {
        const a = offsets.get(index ? index.getX(i) : i);
        const b = offsets.get(index ? index.getX(i + 1) : i + 1);
        const c = offsets.get(index ? index.getX(i + 2) : i + 2);
        if (a !== undefined && b !== undefined && c !== undefined)
          triangles.push([a, b, c]);
      }
  }
  if (!triangles.length) return new THREE.Mesh(geometry, material);
  const positions = geometry.getAttribute("position");
  const normals = geometry.getAttribute("normal");
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(bind);
  const indices: number[] = [],
    weights: number[] = [];
  for (let i = 0; i < positions.count; i++) {
    const position = new THREE.Vector3()
      .fromBufferAttribute(positions, i)
      .applyMatrix4(bind);
    const normal = new THREE.Vector3()
      .fromBufferAttribute(normals, i)
      .applyNormalMatrix(normalMatrix);
    // The back shell must use the same attachment as its corresponding front vertex.
    if (i >= 169) {
      indices.push(...indices.slice((i - 169) * 4, (i - 168) * 4));
      weights.push(...weights.slice((i - 169) * 4, (i - 168) * 4));
      continue;
    }
    let distance = Infinity;
    let fallbackDistance = Infinity;
    let selected = triangles[0];
    let fallback = triangles[0];
    const coordinates = new THREE.Vector3(1, 0, 0);
    const fallbackCoordinates = coordinates.clone();
    const barycentric = new THREE.Vector3();
    const triangle = new THREE.Triangle();
    const closest = new THREE.Vector3();
    const faceNormal = new THREE.Vector3();
    for (const candidate of triangles) {
      triangle.set(
        surface[candidate[0]].position,
        surface[candidate[1]].position,
        surface[candidate[2]].position,
      );
      triangle.closestPointToPoint(position, closest);
      const next = position.distanceToSquared(closest);
      if (!triangle.getBarycoord(closest, barycentric)) continue;
      if (next < fallbackDistance) {
        fallback = candidate;
        fallbackDistance = next;
        fallbackCoordinates.copy(barycentric);
      }
      if (triangle.getNormal(faceNormal).dot(normal) <= 0) continue;
      if (next < distance) {
        selected = candidate;
        distance = next;
        coordinates.copy(barycentric);
      }
    }
    if (!Number.isFinite(distance)) {
      selected = fallback;
      coordinates.copy(fallbackCoordinates);
    }
    const mixed = new Map<number, number>();
    for (let corner = 0; corner < 3; corner++) {
      const vertex = surface[selected[corner]];
      for (let slot = 0; slot < 4; slot++) {
        const bone = vertex.bones[slot];
        mixed.set(
          bone,
          (mixed.get(bone) ?? 0) +
            vertex.weights[slot] * coordinates.getComponent(corner),
        );
      }
    }
    const strongest = [...mixed]
      .filter(([, w]) => w > 0)
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .slice(0, 4);
    const total = strongest.reduce((sum, [, w]) => sum + w, 0);
    for (let slot = 0; slot < 4; slot++) {
      indices.push(strongest[slot]?.[0] ?? 0);
      weights.push((strongest[slot]?.[1] ?? 0) / (total || 1));
    }
  }
  geometry.setAttribute(
    "skinIndex",
    new THREE.Uint16BufferAttribute(indices, 4),
  );
  geometry.setAttribute(
    "skinWeight",
    new THREE.Float32BufferAttribute(weights, 4),
  );
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.bind(source.skeleton, bind);
  mesh.normalizeSkinWeights();
  mesh.frustumCulled = false;
  anchors.set(mesh, anchor);
  return mesh;
}
