import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import {
  attachModelSurfacePainting,
  raycastModelPaint,
  type ModelSurfacePaintTool,
} from "./model-surface-paint";
import type { ModdingPaintStroke } from "@/types/generated/ModdingPaintStroke";

type Surface = Parameters<typeof attachModelSurfacePainting>[0];
type Listener = Parameters<Surface["addEventListener"]>[1];
class SurfacePointer extends Event {
  constructor(
    readonly clientX: number,
    readonly clientY: number,
    readonly pointerId = 1,
    readonly button = 0,
  ) {
    super("pointer", { cancelable: true });
  }
}
class SurfaceDouble implements Surface {
  focused = false;
  focus() {
    this.focused = true;
  }
  readonly handlers = new Map<string, Listener>();
  captured = new Set<number>();
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 100, height: 100 };
  }
  setPointerCapture(id: number) {
    this.captured.add(id);
  }
  hasPointerCapture(id: number) {
    return this.captured.has(id);
  }
  releasePointerCapture(id: number) {
    this.captured.delete(id);
  }
  addEventListener(name: string, listener: Listener) {
    this.handlers.set(name, listener);
  }
  removeEventListener(name: string) {
    this.handlers.delete(name);
  }
  fire(name: string, x = 50, y = 50, id = 1, button = 0) {
    const event = new SurfacePointer(x, y, id, button);
    this.handlers.get(name)?.(event);
    return event;
  }
}
function fixture() {
  const surface = new SurfaceDouble();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 5;
  camera.updateMatrixWorld();
  const material = new THREE.MeshBasicMaterial();
  material.userData.sourceMaterial = "material.vmat";
  const mesh = new THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>(
    new THREE.PlaneGeometry(2, 2),
    material,
  );
  const commits: ModdingPaintStroke[][] = [];
  const controls = { enabled: true };
  const selected: ModelSurfacePaintTool = {
    material: "material.vmat",
    brush: {
      color: [255, 0, 0],
      radius: 0.02,
      hardness: 1,
      opacity: 1,
      erase: false,
    },
    maxPoints: 100,
    onStroke: (stroke) => commits.push([stroke]),
    onStrokes: (strokes) => commits.push(strokes),
  };
  let tool: ModelSurfacePaintTool | null = selected;
  const cleanup = attachModelSurfacePainting(
    surface,
    camera,
    () => mesh,
    () => tool,
    controls,
  );
  return {
    surface,
    material,
    mesh,
    commits,
    controls,
    selected,
    cleanup,
    clearTool() {
      tool = null;
    },
  };
}

describe("surface painting", () => {
  test("commits one gesture with UV orientation matching glTF paint buffers", () => {
    const f = fixture();
    const texture = new THREE.Texture();
    texture.flipY = false;
    f.material.map = texture;
    expect(f.surface.fire("pointerdown", 25, 25).defaultPrevented).toBe(true);
    expect(f.controls.enabled).toBe(false);
    expect(f.commits).toEqual([]);
    f.surface.fire("pointermove", 30, 30);
    f.surface.fire("pointerup", 35, 35);
    expect(f.commits).toHaveLength(1);
    expect(f.commits[0]?.[0]?.points[0]).toEqual([0.25, 0.75]);
    expect(f.commits[0]?.[0]?.points.at(-1)?.[0]).toBeCloseTo(0.35);
    expect(f.controls.enabled).toBe(true);
    expect(f.surface.captured.size).toBe(0);
    expect(f.surface.fire("click").defaultPrevented).toBe(true);
    f.cleanup();
    expect(f.surface.handlers.size).toBe(0);
  });
  test("leaves wrong materials and hidden geometry alone", () => {
    const f = fixture();
    f.material.userData.sourceMaterial = "other.vmat";
    expect(f.surface.fire("pointerdown").defaultPrevented).toBe(false);
    f.material.userData.sourceMaterial = "material.vmat";
    f.mesh.visible = false;
    expect(f.surface.fire("pointerdown").defaultPrevented).toBe(false);
    expect(f.commits).toEqual([]);
    expect(f.controls.enabled).toBe(true);
    f.cleanup();
  });
  test("cancel, tool removal, and cleanup discard partial strokes and restore controls", () => {
    const f = fixture();
    f.surface.fire("pointerdown");
    f.surface.fire("pointercancel");
    expect(f.commits).toEqual([]);
    expect(f.controls.enabled).toBe(true);
    f.surface.fire("pointerdown");
    f.clearTool();
    f.surface.fire("pointerup");
    expect(f.commits).toEqual([]);
    expect(f.controls.enabled).toBe(true);
    const g = fixture();
    g.controls.enabled = false;
    g.surface.fire("pointerdown");
    g.cleanup();
    expect(g.controls.enabled).toBe(false);
    expect(g.commits).toEqual([]);
    f.cleanup();
  });
  test("splits UV jumps and missed regions into one atomic history batch", () => {
    const f = fixture();
    f.surface.fire("pointerdown", 10, 50);
    f.surface.fire("pointermove", 90, 50);
    f.surface.fire("pointermove", 150, 50);
    f.surface.fire("pointerup", 85, 50);
    expect(f.commits).toHaveLength(1);
    expect(f.commits[0]).toHaveLength(3);
    expect(f.commits[0]?.map((stroke) => stroke.points.length)).toEqual([
      1, 1, 1,
    ]);
    f.cleanup();
  });
  test("splits disconnected UV islands even when their coordinates are nearby", () => {
    const f = fixture();
    const left = new THREE.PlaneGeometry(1, 2)
      .translate(-0.5, 0, 0)
      .toNonIndexed();
    const right = new THREE.PlaneGeometry(1, 2)
      .translate(0.5, 0, 0)
      .toNonIndexed();
    const positions = [
      ...left.getAttribute("position").array,
      ...right.getAttribute("position").array,
    ];
    const uvs: number[] = [];
    const parts: [THREE.BufferGeometry, number][] = [
      [left, 0],
      [right, 0.51],
    ];
    for (const [part, offset] of parts) {
      const uv = part.getAttribute("uv");
      for (let i = 0; i < uv.count; i++)
        uvs.push(uv.getX(i) * 0.49 + offset, uv.getY(i));
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    f.mesh.geometry = geometry;
    f.surface.fire("pointerdown", 49, 50);
    f.surface.fire("pointerup", 51, 50);
    expect(f.commits[0]).toHaveLength(2);
    f.cleanup();
  });
  test("only paints the visible material group at the frontmost surface", () => {
    const group = new THREE.Group();
    const selected = new THREE.MeshBasicMaterial();
    selected.userData.sourceMaterial = "selected.vmat";
    const other = new THREE.MeshBasicMaterial();
    other.userData.sourceMaterial = "other.vmat";
    const geometry = new THREE.PlaneGeometry(2, 2);
    geometry.clearGroups();
    geometry.addGroup(0, 3, 0);
    geometry.addGroup(3, 3, 1);
    const mesh = new THREE.Mesh(geometry, [selected, other]);
    group.add(mesh);
    const ray = new THREE.Raycaster(
      new THREE.Vector3(-0.5, 0.5, 5),
      new THREE.Vector3(0, 0, -1),
    );
    expect(raycastModelPaint(ray, group, "selected.vmat")).not.toBeNull();
    ray.ray.origin.set(0.5, -0.5, 5);
    expect(raycastModelPaint(ray, group, "selected.vmat")).toBeNull();
    ray.ray.origin.set(-0.5, 0.5, 5);
    const blocker = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), other);
    blocker.position.z = 1;
    group.add(blocker);
    expect(raycastModelPaint(ray, group, "selected.vmat")).toBeNull();
    blocker.visible = false;
    expect(raycastModelPaint(ray, group, "selected.vmat")).not.toBeNull();
  });
  test("fill uses one seed and point budgets bound a gesture", () => {
    const f = fixture();
    f.selected.mode = "fill";
    f.surface.fire("pointerdown", 50, 50);
    f.surface.fire("pointerup", 55, 50);
    expect(f.commits[0]?.[0]?.points).toEqual([[0.5, 0.5]]);
    f.selected.mode = "brush";
    f.selected.maxPoints = 2;
    f.surface.fire("pointerdown", 50, 50);
    f.surface.fire("pointermove", 55, 50);
    f.surface.fire("pointerup", 60, 50);
    expect(f.commits[1]?.[0]?.points).toHaveLength(2);
    f.cleanup();
  });
  test("transforms texture UVs without introducing an upload flip", () => {
    const f = fixture();
    const texture = new THREE.Texture();
    texture.flipY = true;
    texture.repeat.set(0.5, 0.5);
    texture.offset.set(0.1, 0.2);
    f.material.map = texture;
    f.surface.fire("pointerdown", 20, 20);
    f.surface.fire("pointerup", 20, 20);
    expect(f.commits[0]?.[0]?.points[0]?.[0]).toBeCloseTo(0.2);
    expect(f.commits[0]?.[0]?.points[0]?.[1]).toBeCloseTo(0.6);
    f.cleanup();
  });
  test("raycasts deformed skinned geometry and respects ancestor visibility", () => {
    const geometry = new THREE.PlaneGeometry(0.5, 0.5);
    const count = geometry.getAttribute("position").count;
    geometry.setAttribute(
      "skinIndex",
      new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4),
    );
    const weights = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) weights[i * 4] = 1;
    geometry.setAttribute(
      "skinWeight",
      new THREE.Float32BufferAttribute(weights, 4),
    );
    const material = new THREE.MeshBasicMaterial();
    material.userData.sourceMaterial = "skin.vmat";
    const mesh = new THREE.SkinnedMesh(geometry, material);
    const bone = new THREE.Bone();
    mesh.add(bone);
    mesh.bind(new THREE.Skeleton([bone]));
    bone.position.x = 1;
    const group = new THREE.Group();
    group.add(mesh);
    const ray = new THREE.Raycaster(
      new THREE.Vector3(1, 0, 5),
      new THREE.Vector3(0, 0, -1),
    );
    expect(raycastModelPaint(ray, group, "skin.vmat")?.point).toEqual([
      0.5, 0.5,
    ]);
    group.visible = false;
    expect(raycastModelPaint(ray, group, "skin.vmat")).toBeNull();
  });
});

test("surface painting focuses the viewport so scoped undo shortcuts receive keyboard input", () => {
  const { surface } = fixture();
  surface.fire("pointerdown");
  expect(surface.focused).toBe(true);
});
