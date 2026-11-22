import * as THREE from "three";

export type Silhouette = Float32Array;

const POINT_COUNT = 2400;
const STORAGE_PREFIX = "foundry-silhouette:";
const memory = new Map<string, Silhouette | null>();

const slug = (hero: string) => hero.toLowerCase().replace(/[^a-z0-9]+/g, "_");

const encode = (points: Silhouette): string => {
  const bytes = new Int8Array(points.length);
  for (let i = 0; i < points.length; i++) {
    bytes[i] = Math.max(-127, Math.min(127, Math.round(points[i] * 63.5)));
  }
  let binary = "";
  for (const byte of new Uint8Array(bytes.buffer)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
};

const decode = (encoded: string): Silhouette => {
  const binary = atob(encoded);
  const bytes = new Int8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = (binary.charCodeAt(i) << 24) >> 24;
  }
  return Float32Array.from(bytes, (byte) => byte / 63.5);
};

export const loadSilhouette = async (
  hero: string,
): Promise<Silhouette | null> => {
  const key = slug(hero);
  if (memory.has(key)) return memory.get(key) ?? null;
  const stored = localStorage.getItem(STORAGE_PREFIX + key);
  if (stored) {
    const points = decode(stored);
    memory.set(key, points);
    return points;
  }
  try {
    const response = await fetch(`/foundry/silhouettes/${key}.txt`);
    const shipped =
      response.ok && !response.headers.get("content-type")?.includes("html")
        ? decode((await response.text()).trim())
        : null;
    memory.set(key, shipped);
    return shipped;
  } catch {
    memory.set(key, null);
    return null;
  }
};

export const hasCapturedSilhouette = (hero: string) =>
  localStorage.getItem(STORAGE_PREFIX + slug(hero)) !== null;

const MASK_WIDTH = 240;

const FRONT = new THREE.Vector3(1, 0.04, 0.18).normalize();
const MASK_ASPECT = 0.6;

export const captureSilhouette = (
  hero: string,
  renderer: THREE.WebGLRenderer,
  root: THREE.Object3D,
) => {
  root.updateMatrixWorld(true);
  const sphere = new THREE.Box3()
    .setFromObject(root)
    .getBoundingSphere(new THREE.Sphere());
  const camera = new THREE.PerspectiveCamera(30, MASK_ASPECT, 0.01, 1);
  const distance =
    sphere.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2));
  camera.position.copy(sphere.center).addScaledVector(FRONT, distance);
  camera.far = distance + sphere.radius * 2;
  camera.lookAt(sphere.center);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  const width = MASK_WIDTH;
  const height = Math.round(MASK_WIDTH / MASK_ASPECT);
  const target = new THREE.WebGLRenderTarget(width, height);
  const flat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const swapped: [THREE.Mesh, THREE.Mesh["material"]][] = [];
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      swapped.push([child, child.material]);
      child.material = flat;
    }
  });

  const previousTarget = renderer.getRenderTarget();
  const previousClear = renderer.getClearColor(new THREE.Color());
  const previousAlpha = renderer.getClearAlpha();
  const pixels = new Uint8Array(width * height * 4);
  try {
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(root, camera);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
  } finally {
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(previousClear, previousAlpha);
    for (const [mesh, material] of swapped) mesh.material = material;
    flat.dispose();
    target.dispose();
  }

  const filled: number[] = [];
  let minY = height;
  let maxY = 0;
  let minX = width;
  let maxX = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4] < 128) continue;
      filled.push(x, y);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
  }
  if (filled.length === 0) return;

  const span = Math.max(1, maxY - minY);
  const centreX = (minX + maxX) / 2;
  const scale = 1.9 / span;
  const sampled = new Float32Array(POINT_COUNT * 3);
  for (let i = 0; i < POINT_COUNT; i++) {
    const pick = Math.floor(Math.random() * (filled.length / 2)) * 2;
    const x = filled[pick] + Math.random();
    const y = filled[pick + 1] + Math.random();
    sampled[i * 3] = (x - centreX) * scale;
    sampled[i * 3 + 1] = (y - minY) * scale - 1;
    sampled[i * 3 + 2] = (Math.random() - 0.5) * 0.12;
  }

  const key = slug(hero);
  memory.set(key, sampled);
  try {
    localStorage.setItem(STORAGE_PREFIX + key, encode(sampled));
  } catch {}
};
