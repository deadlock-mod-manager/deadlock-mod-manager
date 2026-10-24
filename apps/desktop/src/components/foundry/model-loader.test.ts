import { afterEach, expect, mock, spyOn, test } from "bun:test";
import type { FoundryModel } from "@/types/foundry";
import { loadPreviewModel } from "./model-loader";

mock.module("@/lib/model-assets", () => ({
  modelAssetUrl: () => "https://asset.localhost/model.glb",
}));

const model: FoundryModel = {
  assetId: "test",
  filePath: "/private/model.glb",
  byteLength: 0,
  vertexCount: 0,
  indexCount: 0,
};

function glb(): ArrayBuffer {
  const json = JSON.stringify({
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: "hero" }],
  });
  const encoded = new TextEncoder().encode(json);
  const size = Math.ceil(encoded.length / 4) * 4;
  const bytes = new ArrayBuffer(20 + size);
  const header = new DataView(bytes);
  header.setUint32(0, 0x46546c67, true);
  header.setUint32(4, 2, true);
  header.setUint32(8, bytes.byteLength, true);
  header.setUint32(12, size, true);
  header.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(bytes, 20).fill(0x20);
  new Uint8Array(bytes, 20, encoded.length).set(encoded);
  return bytes;
}

const fetchAsset = spyOn(globalThis, "fetch");
afterEach(() => fetchAsset.mockReset());

test("loads binary GLB bytes into a Three.js scene without a data URL", async () => {
  fetchAsset.mockResolvedValue(new Response(glb()));
  const controller = new AbortController();
  const loaded = await loadPreviewModel(model, controller.signal);
  expect(loaded.scene.getObjectByName("hero")).toBeDefined();
  expect(fetchAsset).toHaveBeenCalledWith("https://asset.localhost/model.glb", {
    signal: controller.signal,
  });
});

test("rejects a missing artifact before invoking the model parser", async () => {
  fetchAsset.mockResolvedValue(new Response("missing", { status: 404 }));
  await expect(
    loadPreviewModel(model, new AbortController().signal),
  ).rejects.toThrow("404");
});

test("cancellation after transfer prevents GLB parsing", async () => {
  const controller = new AbortController();
  const response = new Response("not a glb");
  const originalRead = response.arrayBuffer.bind(response);
  spyOn(response, "arrayBuffer").mockImplementation(async () => {
    const bytes = await originalRead();
    controller.abort();
    return bytes;
  });
  fetchAsset.mockResolvedValue(response);
  await expect(
    loadPreviewModel(model, controller.signal),
  ).rejects.toMatchObject({ name: "AbortError" });
});
