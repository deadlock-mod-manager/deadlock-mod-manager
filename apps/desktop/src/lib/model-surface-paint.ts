import * as THREE from "three";
import type { ModdingPaintStroke } from "@/types/generated/ModdingPaintStroke";

export interface ModelSurfacePaintTool {
  material: string;
  brush: Omit<ModdingPaintStroke, "points">;
  maxPoints: number;
  mode?: "brush" | "fill";
  onStroke: (stroke: ModdingPaintStroke) => void;
  onStrokes?: (strokes: ModdingPaintStroke[]) => void;
}

export interface ModelSurfacePaintHit {
  point: [number, number];
  object: THREE.Object3D;
  island: number;
}

interface GeometryIslands {
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
  uv: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
  index: THREE.BufferAttribute | null;
  positionVersion: number;
  uvVersion: number;
  indexVersion: number;
  islands: number[];
}
const geometryIslands = new WeakMap<THREE.BufferGeometry, GeometryIslands>();

function attributeVersion(
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
) {
  return attribute instanceof THREE.InterleavedBufferAttribute
    ? attribute.data.version
    : attribute.version;
}

function uvIsland(geometry: THREE.BufferGeometry, face: number): number {
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  const index = geometry.index;
  if (!position || !uv) return face;
  const cached = geometryIslands.get(geometry);
  const positionVersion = attributeVersion(position);
  const uvVersion = attributeVersion(uv);
  const indexVersion = index?.version ?? 0;
  if (
    cached &&
    cached.position === position &&
    cached.uv === uv &&
    cached.index === index &&
    cached.positionVersion === positionVersion &&
    cached.uvVersion === uvVersion &&
    cached.indexVersion === indexVersion
  )
    return cached.islands[face] ?? face;
  const count = Math.floor((index?.count ?? position.count) / 3);
  const parents = Array.from({ length: count }, (_, i) => i);
  const find = (triangle: number): number => {
    let at = triangle;
    while (parents[at] !== at) at = parents[at];
    while (parents[triangle] !== triangle) {
      const next = parents[triangle];
      parents[triangle] = at;
      triangle = next;
    }
    return at;
  };
  const edges = new Map<string, number>();
  const vertex = (offset: number) => {
    const at = index ? index.getX(offset) : offset;
    return `${position.getX(at)},${position.getY(at)},${position.getZ(at)},${uv.getX(at)},${uv.getY(at)}`;
  };
  for (let triangle = 0; triangle < count; triangle++) {
    const vertices = [
      vertex(triangle * 3),
      vertex(triangle * 3 + 1),
      vertex(triangle * 3 + 2),
    ];
    for (let side = 0; side < 3; side++) {
      const a = vertices[side],
        b = vertices[(side + 1) % 3];
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      const neighbor = edges.get(key);
      if (neighbor === undefined) edges.set(key, triangle);
      else parents[find(triangle)] = find(neighbor);
    }
  }
  const islands = parents.map((_, triangle) => find(triangle));
  geometryIslands.set(geometry, {
    position,
    uv,
    index,
    positionVersion,
    uvVersion,
    indexVersion,
    islands,
  });
  return islands[face] ?? face;
}

function visible(object: THREE.Object3D): boolean {
  for (
    let current: THREE.Object3D | null = object;
    current;
    current = current.parent
  )
    if (!current.visible) return false;
  return true;
}

export function raycastModelPaint(
  raycaster: THREE.Raycaster,
  root: THREE.Object3D,
  identity: string,
): ModelSurfacePaintHit | null {
  root.updateWorldMatrix(true, true);
  root.traverse((object) => {
    if (object instanceof THREE.SkinnedMesh) object.computeBoundingSphere();
  });
  for (const hit of raycaster.intersectObject(root, true)) {
    if (!(hit.object instanceof THREE.Mesh) || !visible(hit.object)) continue;
    const material = Array.isArray(hit.object.material)
      ? hit.object.material[hit.face?.materialIndex ?? 0]
      : hit.object.material;
    if (!material?.visible) continue;
    if (material.userData.sourceMaterial !== identity || !hit.uv) return null;
    const uv = hit.uv.clone();
    if (
      (material instanceof THREE.MeshStandardMaterial ||
        material instanceof THREE.MeshBasicMaterial) &&
      material.map
    ) {
      if (material.map.matrixAutoUpdate) material.map.updateMatrix();
      material.map.transformUv(uv);
      // Paint buffers use flipY=false and sample vMapUv in the material shader.
      if (material.map.flipY) uv.y = 1 - uv.y;
    }
    return {
      point: [uv.x, uv.y],
      object: hit.object,
      island: uvIsland(hit.object.geometry, hit.faceIndex ?? 0),
    };
  }
  return null;
}

type PaintPointerEvent = Pick<
  PointerEvent,
  | "pointerId"
  | "button"
  | "clientX"
  | "clientY"
  | "preventDefault"
  | "stopImmediatePropagation"
>;

function consume(event: PaintPointerEvent) {
  event.preventDefault();
  event.stopImmediatePropagation();
}

interface PaintSurface {
  focus?: () => void;
  getBoundingClientRect: () => Pick<
    DOMRect,
    "left" | "top" | "width" | "height"
  >;
  setPointerCapture: (pointerId: number) => void;
  hasPointerCapture: (pointerId: number) => boolean;
  releasePointerCapture: (pointerId: number) => void;
  addEventListener: (
    type: string,
    listener: (event: PaintPointerEvent) => void,
    capture: boolean,
  ) => void;
  removeEventListener: (
    type: string,
    listener: (event: PaintPointerEvent) => void,
    capture: boolean,
  ) => void;
}

export function attachModelSurfacePainting(
  element: PaintSurface,
  camera: THREE.Camera,
  root: () => THREE.Object3D | null,
  tool: () => ModelSurfacePaintTool | null,
  controls: { enabled: boolean },
): () => void {
  const raycaster = new THREE.Raycaster();
  let active: {
    pointerId: number;
    tool: ModelSurfacePaintTool;
    strokes: ModdingPaintStroke[];
    points: number;
    last: ModelSurfacePaintHit | null;
    controlsEnabled: boolean;
  } | null = null;
  let suppressClick = false;
  const hit = (event: PaintPointerEvent, material: string) => {
    const model = root();
    const rect = element.getBoundingClientRect();
    if (!model || rect.width <= 0 || rect.height <= 0) return null;
    camera.updateWorldMatrix(true, false);
    raycaster.setFromCamera(
      new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      camera,
    );
    return raycastModelPaint(raycaster, model, material);
  };
  const finish = (commit: boolean) => {
    const stroke = active;
    if (!stroke) return;
    active = null;
    controls.enabled = stroke.controlsEnabled;
    if (element.hasPointerCapture(stroke.pointerId))
      element.releasePointerCapture(stroke.pointerId);
    if (commit && tool()?.material === stroke.tool.material) {
      if (stroke.tool.onStrokes) stroke.tool.onStrokes(stroke.strokes);
      else for (const segment of stroke.strokes) stroke.tool.onStroke(segment);
    }
  };
  const down = (event: PaintPointerEvent) => {
    if (active) return;
    suppressClick = false;
    const selected = tool();
    if (!selected || event.button !== 0 || selected.maxPoints < 1) return;
    const first = hit(event, selected.material);
    if (!first) return;
    consume(event);
    element.focus?.();
    suppressClick = true;
    active = {
      pointerId: event.pointerId,
      tool: selected,
      strokes: [{ ...selected.brush, points: [first.point] }],
      points: 1,
      last: first,
      controlsEnabled: controls.enabled,
    };
    controls.enabled = false;
    element.setPointerCapture(event.pointerId);
  };
  const move = (event: PaintPointerEvent) => {
    const stroke = active;
    if (!stroke || stroke.pointerId !== event.pointerId) return;
    consume(event);
    if (tool()?.material !== stroke.tool.material) {
      finish(false);
      return;
    }
    if (
      stroke.tool.mode === "fill" ||
      stroke.tool.brush.fillTolerance != null ||
      stroke.points >= stroke.tool.maxPoints
    )
      return;
    const next = hit(event, stroke.tool.material);
    if (!next) {
      stroke.last = null;
      return;
    }
    const previous = stroke.last;
    const distance = previous
      ? Math.hypot(
          next.point[0] - previous.point[0],
          next.point[1] - previous.point[1],
        )
      : Infinity;
    if (distance < 0.002) return;
    if (
      !previous ||
      previous.object !== next.object ||
      previous.island !== next.island ||
      distance > 0.15
    )
      stroke.strokes.push({ ...stroke.tool.brush, points: [] });
    stroke.strokes.at(-1)?.points.push(next.point);
    stroke.points++;
    stroke.last = next;
  };
  const up = (event: PaintPointerEvent) => {
    if (!active || active.pointerId !== event.pointerId) return;
    move(event);
    consume(event);
    finish(true);
  };
  const cancel = (event: PaintPointerEvent) => {
    if (!active || active.pointerId !== event.pointerId) return;
    consume(event);
    finish(false);
  };
  const click = (event: PaintPointerEvent) => {
    if (!suppressClick) return;
    suppressClick = false;
    consume(event);
  };
  const handlers = new Map([
    ["pointerdown", down],
    ["pointermove", move],
    ["pointerup", up],
    ["pointercancel", cancel],
    ["lostpointercapture", cancel],
    ["click", click],
  ]);
  for (const [name, handler] of handlers)
    element.addEventListener(name, handler, true);
  return () => {
    finish(false);
    for (const [name, handler] of handlers)
      element.removeEventListener(name, handler, true);
  };
}
