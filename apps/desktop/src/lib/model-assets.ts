import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { QueryClient, QueryKey, QueryCache } from "@tanstack/react-query";
import type { FoundryModel } from "@/types/foundry";
import logger from "./logger";

const references = new Map<string, number>();
const queryAssets = new WeakMap<QueryCache, Map<string, FoundryModel>>();

/** Owns one artifact lease. Abort also discards an artifact returned by a stale decode. */
export async function decodeFoundryModel(
  filePath: string,
  entryPath: string,
  workspaceRoot: string | null = null,
  signal?: AbortSignal,
): Promise<FoundryModel> {
  signal?.throwIfAborted();
  const requestId = crypto.randomUUID();
  const pending = invoke<FoundryModel>("foundry_decode_model", {
    requestId,
    filePath,
    entryPath,
    workspaceRoot,
  });
  const cancel = () => {
    void invoke("foundry_cancel_model_decode", { requestId }).catch((error) => {
      logger.withError(error).warn("[Foundry] Could not cancel model decode");
    });
  };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    const model = await pending;
    references.set(model.assetId, 1);
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
export function retainFoundryModel(model: FoundryModel): () => void {
  references.set(model.assetId, (references.get(model.assetId) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    releaseFoundryModel(model);
  };
}

export function releaseFoundryModel(model: FoundryModel): void {
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
  model: FoundryModel,
): void {
  const cache = client.getQueryCache();
  let assets = queryAssets.get(cache);
  if (!assets) {
    assets = new Map();
    queryAssets.set(cache, assets);
    const tracked = assets;
    cache.subscribe((event) => {
      if (event.type !== "removed") return;
      const model = tracked.get(event.query.queryHash);
      if (model) releaseFoundryModel(model);
      tracked.delete(event.query.queryHash);
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
}
