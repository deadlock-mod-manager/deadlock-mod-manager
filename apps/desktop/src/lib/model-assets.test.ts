import { beforeEach, expect, mock, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import type { FoundryModel } from "@/types/foundry";
import {
  cacheFoundryModel,
  decodeFoundryModel,
  releaseFoundryModel,
  retainFoundryModel,
} from "./model-assets";

interface IpcArguments {
  assetId?: string;
  requestId?: string;
}

let nextDecode: Promise<FoundryModel>;
const invoke = mock((command: string, _args?: IpcArguments) =>
  command === "foundry_decode_model" ? nextDecode : Promise.resolve(),
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
