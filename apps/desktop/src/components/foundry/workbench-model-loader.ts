import { RuntimeError } from "@deadlock-mods/common/client-errors";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  modelAssetUrl,
  retainFoundryModel,
  type PreviewModel,
} from "@/lib/model-assets";
import { loadSourcePreviewModel } from "./source-model-loader";
import { loadSource2Textures } from "./source2-material";
import { waitForPreviewIdle } from "./preview-idle";
import { previewModelCache } from "./model-scene-cache";
import {
  disposeModelScene,
  type ModelScene,
  type ModelSceneLease,
} from "./model-scene-resources";

export async function loadPreviewModel(
  model: PreviewModel,
  signal: AbortSignal,
  background = false,
): Promise<ModelSceneLease> {
  signal.throwIfAborted();
  const load = async (loadSignal: AbortSignal): Promise<ModelScene> => {
    const release = retainFoundryModel(model);
    let result: ModelScene | undefined;
    try {
      result = await loadUncachedModel(model, loadSignal, background);
      loadSignal.throwIfAborted();
      return result;
    } catch (error) {
      if (result) disposeModelScene(result);
      throw error;
    } finally {
      release();
    }
  };
  if (background) {
    const result = await load(signal);
    let disposed = false;
    return {
      ...result,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        disposeModelScene(result);
      },
    };
  }
  const key =
    "meshes" in model
      ? JSON.stringify(
          model.meshes.map((mesh) => [
            mesh.asset.assetId,
            mesh.name,
            mesh.scale,
          ]),
        )
      : model.assetId;
  let decoded = false;
  const started = performance.now();
  const result = await previewModelCache.load(key, signal, (loadSignal) => {
    decoded = true;
    return load(loadSignal);
  });
  performance.clearMeasures("foundry:model-ready");
  performance.measure("foundry:model-ready", {
    start: started,
    end: performance.now(),
    detail: { cacheHit: !decoded },
  });
  return result;
}

async function loadUncachedModel(
  model: PreviewModel,
  signal: AbortSignal,
  background: boolean,
) {
  if ("meshes" in model)
    return loadSourcePreviewModel(model, signal, background);
  const started = performance.now();
  const response = await fetch(modelAssetUrl(model), { signal });
  if (!response.ok) {
    throw new RuntimeError(`Model asset request failed (${response.status})`);
  }
  const bytes = await response.arrayBuffer();
  signal.throwIfAborted();
  const transferred = performance.now();
  if (background) await waitForPreviewIdle(signal);
  const parseStarted = performance.now();
  const gltf = await new GLTFLoader().parseAsync(bytes, "");
  const source2Textures = await loadSource2Textures(gltf);
  performance.clearMeasures("foundry:model-transfer");
  performance.clearMeasures("foundry:model-parse");
  performance.measure("foundry:model-transfer", {
    start: started,
    end: transferred,
  });
  performance.measure("foundry:model-parse", {
    start: parseStarted,
    end: performance.now(),
  });
  return { ...gltf, source2Textures };
}
