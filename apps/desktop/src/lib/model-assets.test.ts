import { beforeEach, expect, mock, test } from "bun:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import type { FoundryModel } from "@/types/foundry";
import {
  cacheFoundryModel,
  decodeFoundryModel,
  releaseFoundryModel,
  retainFoundryModel,
  decodeModdingSourceModel,
} from "./model-assets";
import type { ModdingSourceModel } from "@/types/generated/ModdingSourceModel";

interface IpcArguments {
  assetId?: string;
  requestId?: string;
}

let nextDecode: Promise<FoundryModel>;
let nextSource: Promise<ModdingSourceModel>;
const invoke = mock((command: string, _args?: IpcArguments) =>
  command === "foundry_decode_model"
    ? nextDecode
    : command === "preview_modding_source_model"
      ? nextSource
      : Promise.resolve(),
);
mock.module("@tauri-apps/api/core", () => ({
  invoke,
  convertFileSrc: (path: string) => `asset://localhost/${path}`,
}));
mock.module("./logger", () => ({
  default: { withError: () => ({ warn: () => {} }) },
}));

let sequence = 0;
const artifact = (): FoundryModel => ({
  assetId: `model-${sequence++}`,
  filePath: "/private/model.glb",
  byteLength: 300_000_000,
  vertexCount: 3,
  indexCount: 3,
});
const released = () =>
  invoke.mock.calls
    .filter(([command]) => command === "foundry_release_model")
    .map(([, args]) => args?.assetId);

beforeEach(() => {
  invoke.mockClear();
  nextDecode = Promise.resolve(artifact());
  nextSource = Promise.resolve({
    meshes: [
      { asset: artifact(), name: "body", scale: 0.4 },
      { asset: artifact(), name: "prop", scale: 1 },
    ],
    diagnostics: [],
  });
});

test("source model mesh leases stay alive until the renderer finishes reading", async () => {
  const model = await decodeModdingSourceModel(
    "addon",
    "models/body.vmdl",
    new AbortController().signal,
  );
  const finish = retainFoundryModel(model);
  releaseFoundryModel(model);
  expect(released()).toEqual([]);
  finish();
  finish();
  expect(released()).toEqual(model.meshes.map((mesh) => mesh.asset.assetId));
});

test("source model cancellation releases every staged mesh", async () => {
  const pending = Promise.withResolvers<ModdingSourceModel>();
  nextSource = pending.promise;
  const controller = new AbortController();
  const decode = decodeModdingSourceModel(
    "addon",
    "models/body.vmdl",
    controller.signal,
  );
  controller.abort();
  const model: ModdingSourceModel = {
    meshes: [
      { asset: artifact(), name: "body", scale: 1 },
      { asset: artifact(), name: "prop", scale: 1 },
    ],
    diagnostics: [],
  };
  pending.resolve(model);
  await expect(decode).rejects.toMatchObject({ name: "AbortError" });
  expect(released()).toEqual(model.meshes.map((mesh) => mesh.asset.assetId));
});

test("an in-flight viewer keeps its file after the preview owner releases it", async () => {
  const model = await decodeFoundryModel("skin.vpk", "hero.vmdl_c");
  const finishLoad = retainFoundryModel(model);
  releaseFoundryModel(model);
  expect(released()).toEqual([]);
  finishLoad();
  finishLoad();
  expect(released()).toEqual([model.assetId]);
});

test("abort cancels the decode and releases an artifact that still arrives", async () => {
  const pending = Promise.withResolvers<FoundryModel>();
  nextDecode = pending.promise;
  const controller = new AbortController();
  const decode = decodeFoundryModel(
    "skin.vpk",
    "hero.vmdl_c",
    null,
    controller.signal,
  );
  controller.abort();
  const model = artifact();
  pending.resolve(model);
  await expect(decode).rejects.toMatchObject({ name: "AbortError" });
  const decodeArgs = invoke.mock.calls.find(
    ([command]) => command === "foundry_decode_model",
  )?.[1];
  expect(
    invoke.mock.calls.find(
      ([command]) => command === "foundry_cancel_model_decode",
    )?.[1]?.requestId,
  ).toBe(decodeArgs?.requestId);
  expect(released()).toEqual([model.assetId]);
});

test("already-aborted requests never start a decode", async () => {
  await expect(
    decodeFoundryModel("skin.vpk", "hero.vmdl_c", null, AbortSignal.abort()),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(invoke).not.toHaveBeenCalled();
});

test("query replacement and eviction release their leases without interrupting a viewer", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const queryKey = ["skin-model-preview", "test"];
  const load = () =>
    client.fetchQuery({
      queryKey,
      staleTime: 0,
      queryFn: async () => {
        const model = await decodeFoundryModel("skin.vpk", "hero.vmdl_c");
        cacheFoundryModel(client, queryKey, model);
        return model;
      },
    });
  const first = await load();
  const finishLoad = retainFoundryModel(first);
  nextDecode = Promise.resolve(artifact());
  const second = await load();
  expect(released()).toEqual([]);
  client.removeQueries({ queryKey });
  expect(released()).toEqual([second.assetId]);
  finishLoad();
  expect(released()).toEqual([second.assetId, first.assetId]);
  client.clear();
});

test("a result cannot become an orphan after its query has been removed", async () => {
  const client = new QueryClient();
  const model = await decodeFoundryModel("skin.vpk", "hero.vmdl_c");
  expect(() => cacheFoundryModel(client, ["removed"], model)).toThrow(
    "removed",
  );
  expect(released()).toEqual([model.assetId]);
  client.clear();
});

test("warm model queries reuse their artifact when returning to a file", async () => {
  const client = new QueryClient();
  const queryKey = ["workbench-model", "warm"];
  const queryFn = mock(async () => {
    const model = await decodeFoundryModel("skin.vpk", "hero.vmdl_c");
    cacheFoundryModel(client, queryKey, model);
    return model;
  });
  const first = await client.fetchQuery({
    queryKey,
    queryFn,
    staleTime: 60_000,
  });
  const second = await client.fetchQuery({
    queryKey,
    queryFn,
    staleTime: 60_000,
  });
  expect(second).toBe(first);
  expect(queryFn).toHaveBeenCalledTimes(1);
  expect(released()).toEqual([]);
  client.clear();
  expect(released()).toEqual([first.assetId]);
});

test("cache pressure evicts inactive artifacts while preserving active viewers", async () => {
  const client = new QueryClient();
  const load = async (name: string) => {
    const queryKey = ["workbench-model", name];
    nextDecode = Promise.resolve({
      ...artifact(),
      byteLength: 100 * 1024 * 1024,
    });
    const model = await client.fetchQuery({
      queryKey,
      queryFn: async () => {
        const model = await decodeFoundryModel("skin.vpk", `${name}.vmdl_c`);
        cacheFoundryModel(client, queryKey, model);
        return model;
      },
    });
    return { model, queryKey };
  };
  const active = await load("active");
  const observer = new QueryObserver(client, {
    queryKey: active.queryKey,
    enabled: false,
  });
  const unsubscribe = observer.subscribe(() => {});
  const old = await load("old");
  const current = await load("current");
  expect(client.getQueryData<FoundryModel>(active.queryKey)).toBe(active.model);
  expect(client.getQueryData<FoundryModel>(old.queryKey)).toBeUndefined();
  expect(client.getQueryData<FoundryModel>(current.queryKey)).toBe(
    current.model,
  );
  expect(released()).toEqual([old.model.assetId]);
  unsubscribe();
  client.clear();
});
