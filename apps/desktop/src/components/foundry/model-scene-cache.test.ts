import { expect, mock, test } from "bun:test";
import * as THREE from "three";
import { ModelSceneCache } from "./model-scene-cache";

const fixture = () => {
  const scene = new THREE.Group();
  const texture = new THREE.DataTexture(new Uint8Array(4 * 16 * 16), 16, 16);
  const material = new THREE.MeshStandardMaterial({ map: texture });
  material.userData.sourceMaterial = "body.vmat";
  const mesh = new THREE.SkinnedMesh(new THREE.BoxGeometry(), material);
  const bone = new THREE.Bone();
  bone.name = "root";
  mesh.add(bone);
  mesh.bind(new THREE.Skeleton([bone]));
  scene.add(mesh);
  return { scene, source2Textures: new Map([[0, texture]]) };
};

test("warm loads share one parse while bones, materials and texture settings stay independent", async () => {
  const cache = new ModelSceneCache();
  const source = fixture();
  const load = mock(async () => source);
  const a = await cache.load("artifact-a", new AbortController().signal, load);
  const b = await cache.load("artifact-a", new AbortController().signal, load);
  expect(load).toHaveBeenCalledTimes(1);
  const first = a.scene.children[0] as THREE.SkinnedMesh<
    THREE.BufferGeometry,
    THREE.MeshStandardMaterial
  >;
  const second = b.scene.children[0] as THREE.SkinnedMesh<
    THREE.BufferGeometry,
    THREE.MeshStandardMaterial
  >;
  first.skeleton.bones[0].position.x = 10;
  first.material.color.set("red");
  first.material.map!.offset.x = 0.7;
  first.geometry.setDrawRange(0, 3);
  expect(second.skeleton.bones[0].position.x).toBe(0);
  expect(second.material.color.getHex()).toBe(0xffffff);
  expect(second.material.map!.offset.x).toBe(0);
  expect(second.geometry.drawRange.count).toBe(Infinity);
  expect(first.material.map).toBe(a.source2Textures.get(0)!);
  a.dispose();
  a.dispose();
  const c = await cache.load("artifact-a", new AbortController().signal, load);
  expect(load).toHaveBeenCalledTimes(1);
  b.dispose();
  c.dispose();
  cache.clear();
});

test("eviction releases templates only after active viewers release their image lease", async () => {
  const cache = new ModelSceneCache({ maxBytes: 1 });
  const source = fixture();
  const disposed = mock();
  source.source2Textures.get(0)!.addEventListener("dispose", disposed);
  const first = await cache.load(
    "large",
    new AbortController().signal,
    async () => source,
  );
  expect(cache.stats().entries).toBe(0);
  expect(disposed).not.toHaveBeenCalled();
  first.dispose();
  expect(disposed).toHaveBeenCalledTimes(1);
  cache.clear();
});

test("cancelling one simultaneous reader does not cancel the other or poison retry", async () => {
  const cache = new ModelSceneCache();
  const pending = Promise.withResolvers<ReturnType<typeof fixture>>();
  const load = mock(() => pending.promise);
  const controller = new AbortController();
  const first = cache.load("shared", controller.signal, load);
  const second = cache.load("shared", new AbortController().signal, load);
  controller.abort();
  await expect(first).rejects.toMatchObject({ name: "AbortError" });
  pending.resolve(fixture());
  const view = await second;
  expect(load).toHaveBeenCalledTimes(1);
  view.dispose();
  cache.clear();
  const fail = mock(async () => {
    throw new Error("decode failed");
  });
  await expect(
    cache.load("failed", new AbortController().signal, fail),
  ).rejects.toThrow("decode failed");
  const retry = await cache.load(
    "failed",
    new AbortController().signal,
    async () => fixture(),
  );
  retry.dispose();
  cache.clear();
});

test("new immutable artifact identities miss, and inactive scenes expire", async () => {
  const cache = new ModelSceneCache({ idleMs: 5 });
  const load = mock(async () => fixture());
  const a = await cache.load("version-1", new AbortController().signal, load);
  a.dispose();
  const b = await cache.load("version-2", new AbortController().signal, load);
  b.dispose();
  expect(load).toHaveBeenCalledTimes(2);
  await Bun.sleep(15);
  expect(cache.stats().entries).toBe(0);
  cache.clear();
});

test("a cancelled late parse is disposed and least-recently-used entries are bounded", async () => {
  const cache = new ModelSceneCache({ maxEntries: 2 });
  const pending = Promise.withResolvers<ReturnType<typeof fixture>>();
  const controller = new AbortController();
  const cancelled = cache.load(
    "cancelled",
    controller.signal,
    () => pending.promise,
  );
  controller.abort();
  await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
  const late = fixture();
  const disposed = mock();
  late.source2Textures.get(0)!.addEventListener("dispose", disposed);
  pending.resolve(late);
  await Bun.sleep(1);
  expect(disposed).toHaveBeenCalledTimes(1);
  const load = mock(async () => fixture());
  for (const key of ["a", "b", "a", "c", "a"]) {
    const view = await cache.load(key, new AbortController().signal, load);
    view.dispose();
  }
  expect(cache.stats().entries).toBe(2);
  expect(load).toHaveBeenCalledTimes(3);
  const evicted = await cache.load("b", new AbortController().signal, load);
  expect(load).toHaveBeenCalledTimes(4);
  evicted.dispose();
  cache.clear();
});

test("an oversized scene bypasses retention without flushing useful smaller entries", async () => {
  const cache = new ModelSceneCache({ maxBytes: 10_000 });
  const loadSmall = mock(async () => fixture());
  const small = await cache.load(
    "small",
    new AbortController().signal,
    loadSmall,
  );
  small.dispose();
  const large = fixture();
  large.scene.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1, 50, 50, 50),
      new THREE.MeshBasicMaterial(),
    ),
  );
  const oversized = await cache.load(
    "oversized",
    new AbortController().signal,
    async () => large,
  );
  oversized.dispose();
  const warm = await cache.load(
    "small",
    new AbortController().signal,
    loadSmall,
  );
  expect(loadSmall).toHaveBeenCalledTimes(1);
  expect(cache.stats().entries).toBe(1);
  warm.dispose();
  cache.clear();
});
