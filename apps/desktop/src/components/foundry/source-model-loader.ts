import { RuntimeError } from "@deadlock-mods/common/client-errors";
import { Group, LoadingManager } from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { modelAssetUrl } from "@/lib/model-assets";
import type { ModdingSourceModel } from "@/types/generated/ModdingSourceModel";

// Keep absent author-drive textures off the network. Embedded FBX images remain local.
const WHITE_PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBf8AAAAASUVORK5CYII=";

export async function loadSourcePreviewModel(
  model: ModdingSourceModel,
  signal: AbortSignal,
) {
  const root = new Group();
  const manager = new LoadingManager();
  manager.setURLModifier((url) =>
    url.startsWith("blob:") || url.startsWith("data:image/")
      ? url
      : WHITE_PIXEL,
  );
  const loader = new FBXLoader(manager);
  for (const mesh of model.meshes) {
    signal.throwIfAborted();
    const response = await fetch(modelAssetUrl(mesh.asset), { signal });
    if (!response.ok)
      throw new RuntimeError(`Source mesh request failed (${response.status})`);
    const bytes = await response.arrayBuffer();
    signal.throwIfAborted();
    const group = loader.parse(bytes, "");
    group.name = mesh.name;
    group.scale.multiplyScalar(mesh.scale);
    root.add(group);
  }
  return { scene: root };
}
