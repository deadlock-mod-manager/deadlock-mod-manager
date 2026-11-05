import { RuntimeError } from "@deadlock-mods/common/client-errors";
import { Group, LoadingManager, type Texture } from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { modelAssetUrl } from "@/lib/model-assets";
import type { ModdingSourceModel } from "@/types/generated/ModdingSourceModel";
import { waitForPreviewIdle } from "./preview-idle";
import { disposeModel } from "./particles/assets";
import { shareSourceModelImages } from "./source-model-images";
import {
  disposeSource2Textures,
  loadSource2Textures,
  sceneMaterials,
  source2Metadata,
} from "./source2-material";

// Keep absent author-drive textures off the network. Embedded FBX images remain local.
const WHITE_PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBf8AAAAASUVORK5CYII=";

export async function loadSourcePreviewModel(
  model: ModdingSourceModel,
  signal: AbortSignal,
  background = false,
) {
  const root = new Group();
  const manager = new LoadingManager();
  manager.setURLModifier((url) =>
    url.startsWith("blob:") || url.startsWith("data:image/")
      ? url
      : WHITE_PIXEL,
  );
  const loader = new FBXLoader(manager);
  const source2Textures = new Map<number, Texture>();
  let textureOffset = 0;
  try {
    for (const mesh of model.meshes) {
      signal.throwIfAborted();
      const response = await fetch(modelAssetUrl(mesh.asset), { signal });
      if (!response.ok)
        throw new RuntimeError(
          `Source mesh request failed (${response.status})`,
        );
      const bytes = await response.arrayBuffer();
      signal.throwIfAborted();
      if (background) await waitForPreviewIdle(signal);
      let group: Group;
      if (mesh.asset.filePath.toLowerCase().endsWith(".glb")) {
        const gltf = await new GLTFLoader().parseAsync(bytes, "");
        group = gltf.scene;
        root.add(group);
        const textures = await loadSource2Textures(gltf, textureOffset);
        for (const [index, texture] of textures)
          source2Textures.set(index, texture);
        for (const material of sceneMaterials(group)) {
          const index = source2Metadata(material)?.color?.tintMaskTexture;
          if (index != null) textureOffset = Math.max(textureOffset, index + 1);
        }
      } else {
        group = loader.parse(bytes, "");
        root.add(group);
      }
      signal.throwIfAborted();
      group.name = mesh.name;
      group.scale.multiplyScalar(mesh.scale);
    }
    shareSourceModelImages(root, source2Textures);
    return { scene: root, source2Textures };
  } catch (error) {
    disposeModel(root);
    disposeSource2Textures(source2Textures);
    throw error;
  }
}
