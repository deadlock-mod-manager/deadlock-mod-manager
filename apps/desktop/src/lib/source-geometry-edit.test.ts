import { describe, expect, it } from "bun:test";
import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
} from "three";
import {
  createSourceGeometryOverlay,
  sourceGeometryWorld,
  transformSourceVertices,
  updateSourceGeometryPreview,
} from "./source-geometry-edit";

const meshes = [
  {
    state: 2,
    positions: [
      [0, 0, 0],
      [2, 0, 0],
      [0, 2, 0],
    ],
    matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 20, 30, 1],
  },
];
describe("source geometry edits", () => {
  it("moves selected source vertices through the exact preview coordinate transform", () => {
    expect(sourceGeometryWorld(meshes[0], [0, 0, 0]).toArray()).toEqual([
      10, 30, -20,
    ]);
    const edits = transformSourceVertices(
      meshes,
      [{ state: 2, vertex: 0 }],
      [1, 2, 3],
      [1, 1, 1],
    );
    expect(edits).toEqual([{ state: 2, vertex: 0, position: [1, -3, 2] }]);
  });
  it("squashes selected vertices about their shared center without touching other vertices", () => {
    expect(
      transformSourceVertices(
        meshes,
        [
          { state: 2, vertex: 0 },
          { state: 2, vertex: 1 },
        ],
        [0, 0, 0],
        [0.5, 1, 1],
      ).map((edit) => edit.position),
    ).toEqual([
      [0.5, 0, 0],
      [1.5, 0, 0],
    ]);
    expect(meshes[0].positions[2]).toEqual([0, 2, 0]);
  });
  it("provides pickable source vertex identities and resettable live overlay", () => {
    const overlay = createSourceGeometryOverlay(meshes);
    expect(overlay.vertices[1]).toEqual({ state: 2, vertex: 1 });
    overlay.update([{ state: 2, vertex: 1, position: [4, 0, 0] }]);
    expect(overlay.points.geometry.getAttribute("position").getX(1)).toBe(14);
    overlay.update([]);
    expect(overlay.points.geometry.getAttribute("position").getX(1)).toBe(12);
    overlay.dispose();
  });
});

it("deforms and resets source-bound primitives without modifying skin weights", () => {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute([10, 30, -20, 12, 30, -20, 10, 30, -22], 3),
  );
  geometry.setAttribute(
    "skinWeight",
    new Float32BufferAttribute([1, 0, 0, 0, 0.5, 0.5, 0, 0, 1, 0, 0, 0], 4),
  );
  geometry.userData = {
    sourceGeometryState: 2,
    sourceGeometryVertices: [0, 1, 2],
  };
  const mesh = new Mesh(geometry, new MeshBasicMaterial());
  const weights = Array.from(geometry.getAttribute("skinWeight").array);
  expect(
    updateSourceGeometryPreview(mesh, meshes, [
      { state: 2, vertex: 1, position: [4, 0, 0] },
    ]),
  ).toBe(1);
  expect(geometry.getAttribute("position").getX(1)).toBe(14);
  expect(Array.from(geometry.getAttribute("skinWeight").array)).toEqual(
    weights,
  );
  updateSourceGeometryPreview(mesh, meshes, []);
  expect(geometry.getAttribute("position").getX(1)).toBe(12);
  geometry.dispose();
  mesh.material.dispose();
});
