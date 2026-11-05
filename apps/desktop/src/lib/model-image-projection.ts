import { ValidationError } from "@deadlock-mods/common/client-errors";
import * as THREE from "three";
import type { ModelImageCrop } from "./model-image-placement";

export interface ModelProjectionImage {
  rgba: Uint8Array;
  width: number;
  height: number;
}
export interface ModelImageProjectionFrame extends ModelProjectionImage {
  durationMs: number;
}
interface ModelImageProjectionRequest {
  material: string;
  frames: readonly ModelImageProjectionFrame[];
  center: [number, number];
  scale: number;
  rotation: number;
  crop?: ModelImageCrop;
}
export type ModelImageProjector = (
  request: ModelImageProjectionRequest,
) => ModelImageProjectionFrame[];

/** Match the native atlas budget without allocating full-size UV maps for every GIF frame. */
export function modelImageProjectionResolution(frameCount: number) {
  return Math.min(
    1024,
    Math.floor(Math.sqrt((64 * 1024 * 1024) / (Math.max(1, frameCount) * 4))),
  );
}

export interface ModelImageProjectionOptions {
  root: THREE.Object3D;
  camera: THREE.Camera;
  material: string;
  image: ModelProjectionImage;
  viewport: { left: number; top: number; width: number; height: number };
  center: { x: number; y: number };
  size: { width: number; height: number };
  /** Clockwise rotation in radians in the current camera view. */
  rotation?: number;
  resolution?: number;
}
export interface ModelImageProjectionBatchOptions extends Omit<
  ModelImageProjectionOptions,
  "image"
> {
  frames: readonly ModelImageProjectionFrame[];
}
type ProjectionView = Omit<ModelImageProjectionOptions, "image">;
interface ProjectionMapping {
  resolution: number;
  coordinates: Float64Array;
  destinations: number[];
  sourceIndices: Map<string, Int32Array>;
}
interface Vertex {
  screen: THREE.Vector3;
  world: THREE.Vector3;
  uv: THREE.Vector2;
}
interface Triangle {
  vertices: [Vertex, Vertex, Vertex];
  target: boolean;
  wrapS: THREE.Wrapping;
  wrapT: THREE.Wrapping;
}
function cross(ax: number, ay: number, bx: number, by: number) {
  return ax * by - ay * bx;
}
function visible(object: THREE.Object3D) {
  for (
    let current: THREE.Object3D | null = object;
    current;
    current = current.parent
  )
    if (!current.visible) return false;
  return true;
}
function stampPoint(
  point: THREE.Vector3,
  options: ProjectionView,
  output = new THREE.Vector3(),
) {
  const x =
    options.viewport.left +
    ((point.x + 1) * options.viewport.width) / 2 -
    options.center.x;
  const y =
    options.viewport.top +
    ((1 - point.y) * options.viewport.height) / 2 -
    options.center.y;
  const angle = options.rotation ?? 0;
  const cosine = Math.cos(angle),
    sine = Math.sin(angle);
  return output.set(
    (x * cosine + y * sine) / options.size.width + 0.5,
    (-x * sine + y * cosine) / options.size.height + 0.5,
    point.z,
  );
}
function triangles(options: ProjectionView): Triangle[] {
  const output: Triangle[] = [];
  options.root.updateWorldMatrix(true, true);
  options.camera.updateWorldMatrix(true, false);
  options.root.traverse((object) => {
    if (
      !(object instanceof THREE.Mesh) ||
      !visible(object) ||
      !options.camera.layers.test(object.layers) ||
      object.userData.previewOutline === true
    )
      return;
    const geometry: THREE.BufferGeometry = object.geometry;
    const position = geometry.getAttribute("position");
    const index = geometry.index;
    if (!position) return;
    const verticesByMaterial = new Map<
      THREE.Material,
      (Vertex | undefined)[]
    >();
    const end = Math.min(
      index?.count ?? position.count,
      geometry.drawRange.start + geometry.drawRange.count,
    );
    for (let offset = geometry.drawRange.start; offset + 2 < end; offset += 3) {
      const group = geometry.groups.find(
        (candidate) =>
          offset >= candidate.start &&
          offset < candidate.start + candidate.count,
      );
      const material = Array.isArray(object.material)
        ? object.material[group?.materialIndex ?? 0]
        : object.material;
      if (!material?.visible) continue;
      const texture =
        material instanceof THREE.MeshStandardMaterial ||
        material instanceof THREE.MeshBasicMaterial
          ? material.map
          : null;
      if (texture?.matrixAutoUpdate) texture.updateMatrix();
      const uv = geometry.getAttribute(
        texture?.channel ? `uv${texture.channel}` : "uv",
      );
      let cached = verticesByMaterial.get(material);
      if (!cached) {
        cached = [];
        verticesByMaterial.set(material, cached);
      }
      const vertex = (at: number): Vertex => {
        const i = index ? index.getX(at) : at;
        const previous = cached[i];
        if (previous) return previous;
        const world = object
          .getVertexPosition(i, new THREE.Vector3())
          .applyMatrix4(object.matrixWorld);
        const point = uv
          ? new THREE.Vector2(uv.getX(i), uv.getY(i))
          : new THREE.Vector2();
        if (texture) point.applyMatrix3(texture.matrix);
        const projected = {
          world,
          uv: point,
          screen: stampPoint(world.clone().project(options.camera), options),
        };
        cached[i] = projected;
        return projected;
      };
      const vertices: [Vertex, Vertex, Vertex] = [
        vertex(offset),
        vertex(offset + 1),
        vertex(offset + 2),
      ];
      if (vertices.some((v) => v.screen.z < -1 || v.screen.z > 1)) continue;
      const [a, b, c] = vertices;
      // Stamp space has downward Y, so front-facing triangles have negative area.
      const front =
        cross(
          b.screen.x - a.screen.x,
          b.screen.y - a.screen.y,
          c.screen.x - a.screen.x,
          c.screen.y - a.screen.y,
        ) < 0;
      if (
        (material.side === THREE.FrontSide && !front) ||
        (material.side === THREE.BackSide && front)
      )
        continue;
      output.push({
        vertices,
        wrapS: texture?.wrapS ?? THREE.ClampToEdgeWrapping,
        wrapT: texture?.wrapT ?? THREE.ClampToEdgeWrapping,
        target:
          front &&
          !!uv &&
          material.userData.sourceMaterial === options.material,
      });
    }
  });
  return output;
}

function rasterize(
  a: THREE.Vector2 | THREE.Vector3,
  b: THREE.Vector2 | THREE.Vector3,
  c: THREE.Vector2 | THREE.Vector3,
  width: number,
  height: number,
  sample: (x: number, y: number, u: number, v: number, w: number) => void,
) {
  const area = cross(b.x - a.x, b.y - a.y, c.x - a.x, c.y - a.y);
  if (Math.abs(area) < 1e-12) return;
  const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x) * width));
  const maxX = Math.min(width - 1, Math.ceil(Math.max(a.x, b.x, c.x) * width));
  const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y) * height));
  const maxY = Math.min(
    height - 1,
    Math.ceil(Math.max(a.y, b.y, c.y) * height),
  );
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++) {
      const px = (x + 0.5) / width,
        py = (y + 0.5) / height;
      const v = cross(px - a.x, py - a.y, c.x - a.x, c.y - a.y) / area;
      const w = cross(b.x - a.x, b.y - a.y, px - a.x, py - a.y) / area;
      const u = 1 - v - w;
      if (Math.min(u, v, w) >= -1e-7) sample(x, y, u, v, w);
    }
}

interface TileRange {
  first: number;
  last: number;
}
const MAX_TRIANGLE_UV_TILES = 256;
const MAX_PROJECTION_UV_TILES = 250_000;
function tileRange(values: number[], wrapping: THREE.Wrapping): TileRange {
  if (!values.every(Number.isFinite))
    throw new ValidationError("Projection requires finite texture coordinates");
  if (
    wrapping !== THREE.RepeatWrapping &&
    wrapping !== THREE.MirroredRepeatWrapping
  )
    return { first: 0, last: 0 };
  const first = Math.floor(Math.min(...values));
  const last = Math.max(first, Math.ceil(Math.max(...values)) - 1);
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last))
    throw new ValidationError(
      "Texture tiling is too large for image projection",
    );
  return { first, last };
}
function tiledCoordinate(
  value: number,
  tile: number,
  wrapping: THREE.Wrapping,
) {
  const coordinate = value - tile;
  return wrapping === THREE.MirroredRepeatWrapping && tile % 2 !== 0
    ? 1 - coordinate
    : coordinate;
}

function validateImage(image: ModelProjectionImage) {
  if (
    !Number.isInteger(image.width) ||
    !Number.isInteger(image.height) ||
    image.width < 1 ||
    image.height < 1 ||
    image.width * image.height * 4 !== image.rgba.length
  )
    throw new ValidationError("Image projection requires a valid RGBA image");
}

function buildProjectionMapping(options: ProjectionView): ProjectionMapping {
  if (
    !Number.isFinite(options.size.width) ||
    !Number.isFinite(options.size.height) ||
    options.size.width <= 0 ||
    options.size.height <= 0 ||
    options.viewport.width <= 0 ||
    options.viewport.height <= 0 ||
    ![
      options.viewport.left,
      options.viewport.top,
      options.viewport.width,
      options.viewport.height,
      options.center.x,
      options.center.y,
    ].every(Number.isFinite) ||
    !Number.isFinite(options.rotation ?? 0) ||
    !Number.isFinite(options.resolution ?? 256)
  )
    throw new ValidationError(
      "Image projection requires valid image, viewport, and stamp dimensions",
    );
  const resolution = Math.min(
    1024,
    Math.max(1, Math.round(options.resolution ?? 256)),
  );
  const coordinates = new Float64Array(resolution * resolution * 2).fill(-1);
  const destinations: number[] = [];
  const projected = triangles(options);
  const depthWidth = Math.min(1024, Math.max(1, Math.ceil(options.size.width)));
  const depthHeight = Math.min(
    1024,
    Math.max(1, Math.ceil(options.size.height)),
  );
  const depth = new Float32Array(depthWidth * depthHeight).fill(Infinity);
  const owners = new Int32Array(depthWidth * depthHeight).fill(-1);
  for (const [triangleIndex, triangle] of projected.entries()) {
    const [a, b, c] = triangle.vertices;
    rasterize(
      a.screen,
      b.screen,
      c.screen,
      depthWidth,
      depthHeight,
      (x, y, u, v, w) => {
        const z = a.screen.z * u + b.screen.z * v + c.screen.z * w;
        const i = y * depthWidth + x;
        if (z < depth[i]) {
          depth[i] = z;
          owners[i] = triangleIndex;
        }
      },
    );
  }
  const outputDepth = new Float32Array(resolution * resolution).fill(Infinity);
  const world = new THREE.Vector3();
  const stamp = new THREE.Vector3();
  let uvTiles = 0;
  for (const [triangleIndex, triangle] of projected.entries()) {
    if (!triangle.target) continue;
    const [a, b, c] = triangle.vertices;
    const s = tileRange(
      triangle.vertices.map((vertex) => vertex.uv.x),
      triangle.wrapS,
    );
    const t = tileRange(
      triangle.vertices.map((vertex) => vertex.uv.y),
      triangle.wrapT,
    );
    const copies = (s.last - s.first + 1) * (t.last - t.first + 1);
    uvTiles += copies;
    if (copies > MAX_TRIANGLE_UV_TILES || uvTiles > MAX_PROJECTION_UV_TILES)
      throw new ValidationError(
        "Texture tiling exceeds the image projection budget; reduce texture tiling before projecting",
      );
    for (let tileS = s.first; tileS <= s.last; tileS++)
      for (let tileT = t.first; tileT <= t.last; tileT++) {
        const copy = (vertex: Vertex) =>
          new THREE.Vector2(
            tiledCoordinate(vertex.uv.x, tileS, triangle.wrapS),
            tiledCoordinate(vertex.uv.y, tileT, triangle.wrapT),
          );
        rasterize(
          copy(a),
          copy(b),
          copy(c),
          resolution,
          resolution,
          (x, y, u, v, w) => {
            world
              .copy(a.world)
              .multiplyScalar(u)
              .addScaledVector(b.world, v)
              .addScaledVector(c.world, w);
            const at = stampPoint(
              world.project(options.camera),
              options,
              stamp,
            );
            if (at.x < 0 || at.y < 0 || at.x >= 1 || at.y >= 1) return;
            const depthX = Math.min(
              depthWidth - 1,
              Math.floor(at.x * depthWidth),
            );
            const depthY = Math.min(
              depthHeight - 1,
              Math.floor(at.y * depthHeight),
            );
            const owner = owners[depthY * depthWidth + depthX];
            const covering = projected[owner];
            if (owner !== triangleIndex && covering) {
              const pa = covering.vertices[0].screen,
                pb = covering.vertices[1].screen,
                pc = covering.vertices[2].screen;
              const area = cross(
                pb.x - pa.x,
                pb.y - pa.y,
                pc.x - pa.x,
                pc.y - pa.y,
              );
              const cv =
                cross(at.x - pa.x, at.y - pa.y, pc.x - pa.x, pc.y - pa.y) /
                area;
              const cw =
                cross(pb.x - pa.x, pb.y - pa.y, at.x - pa.x, at.y - pa.y) /
                area;
              const cu = 1 - cv - cw;
              if (
                Math.min(cu, cv, cw) >= -1e-7 &&
                at.z > pa.z * cu + pb.z * cv + pc.z * cw + 0.0001
              )
                return;
            }
            const pixel = y * resolution + x;
            if (at.z > outputDepth[pixel]) return;
            if (!Number.isFinite(outputDepth[pixel])) destinations.push(pixel);
            outputDepth[pixel] = at.z;
            coordinates[pixel * 2] = at.x;
            coordinates[pixel * 2 + 1] = at.y;
          },
        );
      }
  }
  return { resolution, coordinates, destinations, sourceIndices: new Map() };
}

function renderProjection(
  mapping: ProjectionMapping,
  image: ModelProjectionImage,
): ModelProjectionImage {
  const key = `${image.width}x${image.height}`;
  let indices = mapping.sourceIndices.get(key);
  if (!indices) {
    indices = new Int32Array(mapping.destinations.length);
    for (let i = 0; i < mapping.destinations.length; i++) {
      const pixel = mapping.destinations[i];
      const x = Math.min(
        image.width - 1,
        Math.floor(mapping.coordinates[pixel * 2] * image.width),
      );
      const y = Math.min(
        image.height - 1,
        Math.floor(mapping.coordinates[pixel * 2 + 1] * image.height),
      );
      indices[i] = (y * image.width + x) * 4;
    }
    mapping.sourceIndices.set(key, indices);
  }
  const rgba = new Uint8Array(mapping.resolution * mapping.resolution * 4);
  for (let i = 0; i < mapping.destinations.length; i++) {
    const pixel = mapping.destinations[i];
    const source = indices[i];
    if (!image.rgba[source + 3]) continue;
    const destination = pixel * 4;
    rgba[destination] = image.rgba[source];
    rgba[destination + 1] = image.rgba[source + 1];
    rgba[destination + 2] = image.rgba[source + 2];
    rgba[destination + 3] = image.rgba[source + 3];
  }
  return { rgba, width: mapping.resolution, height: mapping.resolution };
}

/** Projects one decoded image into a transparent UV overlay. */
export function projectModelImage(
  options: ModelImageProjectionOptions,
): ModelProjectionImage {
  validateImage(options.image);
  return renderProjection(buildProjectionMapping(options), options.image);
}

/** Geometry, skinning, occlusion and UV sampling are shared by every frame. */
export function projectModelImages(
  options: ModelImageProjectionBatchOptions,
): ModelImageProjectionFrame[] {
  if (!options.frames.length) return [];
  const resolution = Math.min(
    1024,
    Math.max(1, Math.round(options.resolution ?? 256)),
  );
  if (
    options.frames.length > 128 ||
    options.frames.length * resolution * resolution * 4 > 128 * 1024 * 1024
  )
    throw new ValidationError(
      "Projected animation exceeds 128 frames or 128 MiB; reduce the projection resolution",
    );
  for (const frame of options.frames) validateImage(frame);
  const mapping = buildProjectionMapping(options);
  return options.frames.map((frame) => ({
    ...renderProjection(mapping, frame),
    durationMs: frame.durationMs,
  }));
}
