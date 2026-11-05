import { z } from "zod";
import { ValidationError } from "@deadlock-mods/common/client-errors";
import {
  BufferGeometry,
  Float32BufferAttribute,
  Matrix4,
  Mesh,
  type Object3D,
  Points,
  PointsMaterial,
  Vector3,
} from "three";

export interface SourceGeometryMesh {
  state: number;
  positions: number[][];
  matrix: number[];
}
export interface SourceVertexEdit {
  state: number;
  vertex: number;
  position: number[];
}
export interface GeometryVertex {
  state: number;
  vertex: number;
}

/** Source DMX positions use Z-up. The preview uses the same Y-up conversion as the decoder. */
export function sourceGeometryWorld(
  mesh: SourceGeometryMesh,
  position: number[],
) {
  const value = new Vector3(position[0], position[1], position[2]).applyMatrix4(
    new Matrix4().fromArray(mesh.matrix),
  );
  return new Vector3(value.x, value.z, -value.y);
}

export function transformSourceVertices(
  meshes: SourceGeometryMesh[],
  selected: GeometryVertex[],
  move: number[],
  scale: number[],
): SourceVertexEdit[] {
  if (
    [...move, ...scale].some((value) => !Number.isFinite(value)) ||
    move.length !== 3 ||
    scale.length !== 3 ||
    scale.some((value) => value <= 0)
  ) {
    throw new ValidationError(
      "Enter finite movement and positive scale values",
    );
  }
  const vertices = selected.map((selection) => {
    const mesh = meshes.find((mesh) => mesh.state === selection.state);
    const position = mesh?.positions[selection.vertex];
    if (!mesh || !position)
      throw new ValidationError("Selected source vertex is unavailable");
    return { selection, mesh, world: sourceGeometryWorld(mesh, position) };
  });
  const center = vertices
    .reduce((center, vertex) => center.add(vertex.world), new Vector3())
    .divideScalar(vertices.length || 1);
  return vertices.map(({ selection, mesh, world }) => {
    world
      .sub(center)
      .multiply(new Vector3(scale[0], scale[1], scale[2]))
      .add(center)
      .add(new Vector3(move[0], move[1], move[2]));
    const native = new Vector3(world.x, -world.z, world.y);
    const matrix = new Matrix4().fromArray(mesh.matrix);
    if (Math.abs(matrix.determinant()) < 1e-12)
      throw new ValidationError("Source mesh transform cannot be inverted");
    native.applyMatrix4(matrix.invert());
    return {
      state: selection.state,
      vertex: selection.vertex,
      position: native.toArray(),
    };
  });
}

/** Point indices map directly to source vertices. Selection survives UV seams. */
export function createSourceGeometryOverlay(meshes: SourceGeometryMesh[]) {
  const vertices: GeometryVertex[] = [];
  const positions: number[] = [];
  for (const mesh of meshes) {
    for (const [vertex, position] of mesh.positions.entries()) {
      vertices.push({ state: mesh.state, vertex });
      positions.push(...sourceGeometryWorld(mesh, position).toArray());
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  const material = new PointsMaterial({
    color: 0xffbd69,
    size: 4,
    sizeAttenuation: false,
    depthTest: false,
  });
  const points = new Points(geometry, material);
  points.renderOrder = 100;
  points.name = "source-geometry-vertices";
  return {
    points,
    vertices,
    update(edits: SourceVertexEdit[]) {
      const changes = new Map(
        edits.map((edit) => [`${edit.state}:${edit.vertex}`, edit.position]),
      );
      const attribute = geometry.getAttribute("position");
      for (const [index, vertex] of vertices.entries()) {
        const mesh = meshes.find((mesh) => mesh.state === vertex.state);
        const position =
          changes.get(`${vertex.state}:${vertex.vertex}`) ??
          mesh?.positions[vertex.vertex];
        if (!mesh || !position) continue;
        const world = sourceGeometryWorld(mesh, position);
        attribute.setXYZ(index, world.x, world.y, world.z);
      }
      attribute.needsUpdate = true;
      geometry.computeBoundingSphere();
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

const sourceBinding = z.object({
  sourceGeometryState: z.number().int().nonnegative(),
  sourceGeometryVertices: z.array(z.number().int().nonnegative()),
});

/** Update only positions of DMX primitives with explicit exporter bindings. */
export function updateSourceGeometryPreview(
  scene: Object3D,
  meshes: SourceGeometryMesh[],
  edits: SourceVertexEdit[],
) {
  const changes = new Map(
    edits.map((edit) => [`${edit.state}:${edit.vertex}`, edit.position]),
  );
  let updated = 0;
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const parsed = sourceBinding.safeParse(object.geometry.userData);
    if (!parsed.success) return;
    const binding = parsed.data;
    const mesh = meshes.find(
      (mesh) => mesh.state === binding.sourceGeometryState,
    );
    if (!mesh) return;
    const attribute = object.geometry.getAttribute("position");
    if (attribute.count !== binding.sourceGeometryVertices.length) return;
    for (const [index, vertex] of binding.sourceGeometryVertices.entries()) {
      const position =
        changes.get(`${mesh.state}:${vertex}`) ?? mesh.positions[vertex];
      if (!position) continue;
      const world = sourceGeometryWorld(mesh, position);
      attribute.setXYZ(index, world.x, world.y, world.z);
    }
    attribute.needsUpdate = true;
    object.geometry.computeVertexNormals();
    object.geometry.computeBoundingBox();
    object.geometry.computeBoundingSphere();
    updated += 1;
  });
  return updated;
}

export interface GeometryPreviewControls {
  meshes: SourceGeometryMesh[];
  edits: SourceVertexEdit[];
  selected: GeometryVertex[];
  onPick: (vertex: GeometryVertex, additive: boolean) => void;
}
