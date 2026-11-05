import { afterEach, expect, mock, spyOn, test } from "bun:test";
import {
  BufferGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Texture,
  type LoadingManager,
} from "three";
import type { ModdingSourceModel } from "@/types/generated/ModdingSourceModel";

let manager: LoadingManager;
const parse = mock(() => new Group());
const parseGlb = mock(async () => ({ scene: new Group() }));
mock.module("three/examples/jsm/loaders/GLTFLoader.js", () => ({
  GLTFLoader: class {
    parseAsync = parseGlb;
  },
}));
mock.module("three/examples/jsm/loaders/FBXLoader.js", () => ({
  FBXLoader: class {
    constructor(value: LoadingManager) {
      manager = value;
    }
    parse = parse;
  },
}));
mock.module("@/lib/model-assets", () => ({
  modelAssetUrl: (asset: { filePath: string }) =>
    `asset://localhost/${asset.filePath}`,
  retainFoundryModel: () => () => {},
}));
const { loadSourcePreviewModel } = await import("./source-model-loader");
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  parse.mockClear();
  parseGlb.mockClear();
});
const model: ModdingSourceModel = {
  meshes: [
    {
      name: "Body",
      scale: 0.4,
      asset: {
        assetId: "source-fbx",
        filePath: "private/body.fbx",
        byteLength: 3,
        vertexCount: 0,
        indexCount: 0,
      },
    },
  ],
  diagnostics: [],
};

test("source FBX geometry feeds the existing renderer with ModelDoc import scale", async () => {
  const requests: string[] = [];
  globalThis.fetch = Object.assign(
    async (input: string | URL | Request) => {
      requests.push(String(input));
      return new Response(new Uint8Array([1, 2, 3]));
    },
    { preconnect: originalFetch.preconnect },
  );
  const result = await loadSourcePreviewModel(
    model,
    new AbortController().signal,
  );
  expect(requests).toEqual(["asset://localhost/private/body.fbx"]);
  expect(result.scene.children[0]?.name).toBe("Body");
  expect(result.scene.children[0]?.scale.toArray()).toEqual([0.4, 0.4, 0.4]);
  expect(parse).toHaveBeenCalledTimes(1);
  expect(manager.resolveURL("C:/author/private/texture.png")).toStartWith(
    "data:image/png",
  );
  expect(
    manager.resolveURL("https://external.example/texture.png"),
  ).toStartWith("data:image/png");
  expect(manager.resolveURL("blob:embedded-texture")).toBe(
    "blob:embedded-texture",
  );
});

test("cancellation prevents source mesh reads", async () => {
  await expect(
    loadSourcePreviewModel(model, AbortSignal.abort()),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(parse).not.toHaveBeenCalled();
});

test("a later source mesh failure releases geometry and materials loaded so far", async () => {
  const material = new MeshBasicMaterial();
  const geometry = new BufferGeometry();
  const group = new Group();
  group.add(new Mesh(geometry, material));
  const disposeMaterial = spyOn(material, "dispose");
  const disposeGeometry = spyOn(geometry, "dispose");
  parse.mockReturnValueOnce(group);
  let reads = 0;
  globalThis.fetch = Object.assign(
    async () =>
      ++reads === 1
        ? new Response(new Uint8Array([1, 2, 3]))
        : new Response("missing", { status: 404 }),
    { preconnect: originalFetch.preconnect },
  );
  await expect(
    loadSourcePreviewModel(
      { ...model, meshes: [...model.meshes, ...model.meshes] },
      new AbortController().signal,
    ),
  ).rejects.toThrow("404");
  expect(disposeMaterial).toHaveBeenCalledTimes(1);
  expect(disposeGeometry).toHaveBeenCalledTimes(1);
});

test("native DMX geometry loads as GLB alongside FBX with each ModelDoc scale", async () => {
  globalThis.fetch = Object.assign(
    async () => new Response(new Uint8Array([1, 2, 3])),
    { preconnect: originalFetch.preconnect },
  );
  const native: ModdingSourceModel = {
    meshes: [
      ...model.meshes,
      {
        name: "DMX skull",
        scale: 2,
        asset: {
          assetId: "native-dmx",
          filePath: "private/skull.glb",
          byteLength: 3,
          vertexCount: 4,
          indexCount: 6,
        },
      },
    ],
    diagnostics: [],
  };
  const result = await loadSourcePreviewModel(
    native,
    new AbortController().signal,
  );
  expect(parse).toHaveBeenCalledTimes(1);
  expect(parseGlb).toHaveBeenCalledTimes(1);
  expect(result.scene.children.map((child) => child.name)).toEqual([
    "Body",
    "DMX skull",
  ]);
  expect(result.scene.children[1]?.scale.toArray()).toEqual([2, 2, 2]);
});

test("combining source GLBs preserves independent tint masks with overlapping local texture indices", async () => {
  globalThis.fetch = Object.assign(
    async () => new Response(new Uint8Array([1, 2, 3])),
    { preconnect: originalFetch.preconnect },
  );
  const masks = [new Texture(), new Texture()];
  const materials = masks.map((mask) => {
    const material = new MeshStandardMaterial();
    material.userData.source2 = {
      schemaVersion: 1,
      shader: "pbr.vfx",
      blendMode: "opaque",
      unlit: false,
      color: {
        tint: [0.2, 0.4, 0.6],
        tintMode: 0,
        contrastSaturationBrightness: [1, 1, 1],
        reflectivity: [0.2, 0.2, 0.2],
        maskColorTint: true,
        maskVertexColor: false,
        vertexColorBeforeCorrection: false,
        vertexColorStrength: 1,
        tintMaskTexture: 3,
      },
    };
    const scene = new Group();
    scene.add(new Mesh(undefined, material));
    parseGlb.mockImplementationOnce(async () => ({
      scene,
      parser: { getDependency: async () => mask },
    }));
    return material;
  });
  const meshes = materials.map((_, index) => ({
    ...model.meshes[0],
    name: `mesh_${index}`,
    asset: { ...model.meshes[0].asset, filePath: `private/mesh_${index}.glb` },
  }));
  const result = await loadSourcePreviewModel(
    { meshes, diagnostics: [] },
    new AbortController().signal,
  );
  expect(result.source2Textures.size).toBe(2);
  expect(result.source2Textures.get(3)).toBe(masks[0]);
  expect(result.source2Textures.get(7)).toBe(masks[1]);
  expect(materials[0].userData.source2.color.tintMaskTexture).toBe(3);
  expect(materials[1].userData.source2.color.tintMaskTexture).toBe(7);
});
