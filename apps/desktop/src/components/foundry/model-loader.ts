import { RuntimeError } from "@deadlock-mods/common/client-errors";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { modelAssetUrl } from "@/lib/model-assets";
import type { FoundryModel } from "@/types/foundry";

export async function loadPreviewModel(
  model: FoundryModel,
  signal: AbortSignal,
) {
  const started = performance.now();
  const response = await fetch(modelAssetUrl(model), { signal });
  if (!response.ok) {
    throw new RuntimeError(`Model asset request failed (${response.status})`);
  }
  const bytes = await response.arrayBuffer();
  signal.throwIfAborted();
  const transferred = performance.now();
  const gltf = await new GLTFLoader().parseAsync(bytes, "");
  performance.clearMeasures("foundry:model-transfer");
  performance.clearMeasures("foundry:model-parse");
  performance.measure("foundry:model-transfer", {
    start: started,
    end: transferred,
  });
  performance.measure("foundry:model-parse", {
    start: transferred,
    end: performance.now(),
  });
  return gltf;
}
