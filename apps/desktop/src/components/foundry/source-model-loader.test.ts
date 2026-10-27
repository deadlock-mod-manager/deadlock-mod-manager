import { afterEach, expect, mock, test } from "bun:test";
import { Group, type LoadingManager } from "three";
import type { ModdingSourceModel } from "@/types/generated/ModdingSourceModel";

let manager: LoadingManager;
const parse = mock(() => new Group());
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
}));
const { loadSourcePreviewModel } = await import("./source-model-loader");
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  parse.mockClear();
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
