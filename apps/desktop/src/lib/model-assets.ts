import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { QueryClient, QueryKey, QueryCache } from "@tanstack/react-query";
import type { FoundryModel } from "@/types/foundry";
import type { ModdingHierarchy } from "@/types/generated/ModdingHierarchy";
import type { ModdingSourceModel } from "@/types/generated/ModdingSourceModel";
import logger from "./logger";

const references = new Map<string, number>();
export type PreviewModel = FoundryModel | ModdingSourceModel;
const queryAssets = new WeakMap<QueryCache, Map<string, PreviewModel>>();
export const MODEL_PREVIEW_GC_TIME = 60_000;
const MAX_CACHED_MODEL_BYTES = 256 * 1024 * 1024;
const MAX_CACHED_MODELS = 8;
const artifacts = (model: PreviewModel): FoundryModel[] =>
  "meshes" in model ? model.meshes.map((mesh) => mesh.asset) : [model];

/** Owns one artifact lease. Abort also discards an artifact returned by a stale decode. */
export async function decodeFoundryModel(
  filePath: string,
  entryPath: string,
  workspaceRoot: string | null = null,
  signal?: AbortSignal,
  overlayRoot?: string,
): Promise<FoundryModel> {
  signal?.throwIfAborted();
  const requestId = crypto.randomUUID();
  const pending = invoke<FoundryModel>("foundry_decode_model", {
    requestId,
    filePath,
    entryPath,
    workspaceRoot,
    overlayRoot,
  });
  return ownModelDecode(requestId, pending, signal);
}

export async function decodeModdingDmx(
  addonId: string,
  hierarchy: ModdingHierarchy,
  path: string,
  signal: AbortSignal,
): Promise<FoundryModel> {
  signal.throwIfAborted();
  const requestId = crypto.randomUUID();
  return ownModelDecode(
    requestId,
    invoke<FoundryModel>("preview_modding_dmx", {
      requestId,
      addonId,
      hierarchy,
      path,
    }),
    signal,
  );
}

async function ownModelDecode(
  requestId: string,
  pending: Promise<FoundryModel>,
  signal?: AbortSignal,
): Promise<FoundryModel> {
  return ownPreviewDecode(requestId, pending, signal);
}

export async function decodeModdingSourceModel(
  addonId: string,
  path: string,
  signal: AbortSignal,
): Promise<ModdingSourceModel> {
  signal.throwIfAborted();
  const requestId = crypto.randomUUID();
  return ownPreviewDecode(
    requestId,
    invoke<ModdingSourceModel>("preview_modding_source_model", {
      requestId,
      addonId,
      path,
    }),
    signal,
  );
}

async function ownPreviewDecode<T extends PreviewModel>(
  requestId: string,
  pending: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const cancel = () => {
    void invoke("foundry_cancel_model_decode", { requestId }).catch((error) => {
      logger.withError(error).warn("[Foundry] Could not cancel model decode");
    });
  };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    const model = await pending;
    for (const asset of artifacts(model)) references.set(asset.assetId, 1);
    if (signal?.aborted) {
      releaseFoundryModel(model);
      signal.throwIfAborted();
    }
    return model;
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
}

/** Keeps the file alive while a viewer's fetch/parse is still in flight. */
export function retainFoundryModel(model: PreviewModel): () => void {
  for (const asset of artifacts(model))
    references.set(asset.assetId, (references.get(asset.assetId) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    releaseFoundryModel(model);
  };
}

export function releaseFoundryModel(model: PreviewModel): void {
  for (const asset of artifacts(model)) releaseArtifact(asset);
}

function releaseArtifact(model: FoundryModel): void {
  const count = references.get(model.assetId);
  if (count === undefined) return;
  if (count > 1) {
    references.set(model.assetId, count - 1);
    return;
  }
  references.delete(model.assetId);
  void invoke("foundry_release_model", { assetId: model.assetId }).catch(
    (error) => {
      logger
        .withError(error)
        .warn("[Foundry] Could not release model artifact");
    },
  );
}

export function modelAssetUrl(model: FoundryModel): string {
  return convertFileSrc(model.filePath);
}

/** Query eviction and refetch replacement release the cache's lease, not a viewer's. */
export function cacheFoundryModel(
  client: QueryClient,
  queryKey: QueryKey,
  model: PreviewModel,
): void {
  const cache = client.getQueryCache();
  let assets = queryAssets.get(cache);
  if (!assets) {
    assets = new Map();
    queryAssets.set(cache, assets);
    const tracked = assets;
    cache.subscribe((event) => {
      const hash = event.query.queryHash;
      if (event.type === "removed") {
        const model = tracked.get(hash);
        if (model) releaseFoundryModel(model);
        tracked.delete(hash);
      } else if (event.type === "observerAdded") {
        const model = tracked.get(hash);
        if (model) {
          tracked.delete(hash);
          tracked.set(hash, model);
        }
      } else if (event.type === "observerRemoved") {
        trimModelCache(client, tracked);
      }
    });
  }
  const query = cache.find({ queryKey, exact: true });
  if (!query) {
    releaseFoundryModel(model);
    throw new DOMException("Model preview query was removed", "AbortError");
  }
  const previous = assets.get(query.queryHash);
  assets.set(query.queryHash, model);
  if (previous) releaseFoundryModel(previous);
  trimModelCache(client, assets, query.queryHash);
}

function trimModelCache(
  client: QueryClient,
  assets: Map<string, PreviewModel>,
  keep?: string,
) {
  let bytes = [...assets.values()].reduce(
    (total, model) =>
      total +
      artifacts(model).reduce((size, asset) => size + asset.byteLength, 0),
    0,
  );
  for (const [hash, model] of assets) {
    if (bytes <= MAX_CACHED_MODEL_BYTES && assets.size <= MAX_CACHED_MODELS)
      break;
    const query = client.getQueryCache().get(hash);
    if (
      hash === keep ||
      !query ||
      query.getObserversCount() > 0 ||
      query.state.fetchStatus !== "idle"
    )
      continue;
    bytes -= artifacts(model).reduce(
      (size, asset) => size + asset.byteLength,
      0,
    );
    client.removeQueries({ queryKey: query.queryKey, exact: true });
  }
}
