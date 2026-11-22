import {
  useQuery,
  useQueryClient,
  type QueryCache,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import * as THREE from "three";
import { decodeFoundryModel, releaseFoundryModel } from "@/lib/model-assets";
import logger from "@/lib/logger";
import { particleModelPaths } from "@/lib/particles/effect";
import type { PreviewSource } from "@/lib/preview-animation";
import type { PreviewParticles } from "@/types/generated/PreviewParticles";
import { loadPreviewModel } from "./model-loader";
import {
  installAnimatedMaterials,
  type AnimatedMaterials,
} from "@/lib/animated-materials";

interface ParticleModelAssets {
  models: ReadonlyMap<string, THREE.Object3D>;
  materials: AnimatedMaterials[];
}

const queryAssets = new WeakMap<QueryCache, Map<string, ParticleModelAssets>>();

const ownAssets = (
  client: QueryClient,
  key: QueryKey,
  assets: ParticleModelAssets,
) => {
  const cache = client.getQueryCache();
  let tracked = queryAssets.get(cache);
  if (!tracked) {
    tracked = new Map();
    queryAssets.set(cache, tracked);
    const owned = tracked;
    cache.subscribe((event) => {
      if (event.type !== "removed") return;
      const assets = owned.get(event.query.queryHash);
      if (assets) disposeAssets(assets);
      owned.delete(event.query.queryHash);
    });
  }
  const query = cache.find({ queryKey: key, exact: true });
  if (!query) {
    disposeAssets(assets);
    return;
  }
  const previous = tracked.get(query.queryHash);
  if (previous) disposeAssets(previous);
  tracked.set(query.queryHash, assets);
};

const disposeAssets = (assets: ParticleModelAssets) => {
  for (const material of assets.materials) material.dispose();
  const textures = new Set<THREE.Texture>();
  const bitmaps = new Set<ImageBitmap>();
  const materials = new Set<THREE.Material>();
  const geometries = new Set<THREE.BufferGeometry>();
  for (const root of assets.models.values())
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material]) {
        materials.add(material);
        for (const value of Object.values(material))
          if (value instanceof THREE.Texture) textures.add(value);
      }
    });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) {
    if (texture.source.data instanceof ImageBitmap)
      bitmaps.add(texture.source.data);
    texture.dispose();
  }
  for (const bitmap of bitmaps) bitmap.close();
};

/** Dependencies are decoded once, before constructing drawables, never during playback. */
export function useParticleModels(
  source: PreviewSource,
  effects: (PreviewParticles | null | undefined)[],
) {
  const client = useQueryClient();
  const paths = [
    ...new Set(
      effects.flatMap((data) => (data ? particleModelPaths(data) : [])),
    ),
  ]
    .sort()
    .slice(0, 12);
  const queryKey = ["particle-models", source.filePath, ...paths];
  const query = useQuery({
    queryKey,
    enabled: paths.length > 0,
    gcTime: 0,
    staleTime: Infinity,
    retry: false,
    meta: { skipGlobalErrorHandler: true },
    queryFn: async ({ signal }) => {
      const models = new Map<string, THREE.Object3D>();
      const assets: ParticleModelAssets = { models, materials: [] };
      try {
        // Serial decoding bounds peak decompression/GLB memory on the webview.
        for (const path of paths) {
          signal.throwIfAborted();
          try {
            const model = await decodeFoundryModel(
              source.filePath,
              path.endsWith("_c") ? path : `${path}_c`,
              null,
              signal,
            );
            try {
              const gltf = await loadPreviewModel(model, signal);
              models.set(path, gltf.scene);
              assets.materials.push(
                await installAnimatedMaterials(gltf.scene, (index) =>
                  gltf.parser.getDependency("texture", index),
                ),
              );
              signal.throwIfAborted();
            } finally {
              releaseFoundryModel(model);
            }
          } catch (error) {
            signal.throwIfAborted();
            logger
              .withError(error)
              .withMetadata({ path })
              .warn("[Foundry] Particle model is unavailable");
          }
        }
        ownAssets(client, queryKey, assets);
        return assets;
      } catch (error) {
        disposeAssets(assets);
        throw error;
      }
    },
  });
  return {
    models: query.data?.models,
    materials: query.data?.materials,
    loading: query.isFetching,
  };
}
