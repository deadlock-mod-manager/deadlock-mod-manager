import * as THREE from "three";
import type { FoundryModel } from "@/types/foundry";
import { modelAssetUrl, retainFoundryModel } from "@/lib/model-assets";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { FoundryParticleGraph } from "@/types/generated/FoundryParticleGraph";
import type { ParticleTexture } from "@/types/generated/ParticleTexture";

import { gradientTexture } from "./texture-layers";
import { bool, str, type Fields } from "./values";

export interface ParticleModelAsset {
  path: string;
  asset: FoundryModel;
}

export class ParticleAssets {
  private readonly gradients = new Map<Fields, THREE.Texture>();
  layer(ref: Fields) {
    if (!bool(ref.m_bReplaceTextureWithGradient))
      return this.textures.get(str(ref.m_hTexture))?.texture;
    let texture = this.gradients.get(ref);
    if (!texture) {
      texture = gradientTexture(ref);
      this.gradients.set(ref, texture);
    }
    return texture;
  }
  readonly textures = new Map<
    string,
    { texture: THREE.Texture; sheet: ParticleTexture }
  >();
  readonly models = new Map<string, THREE.Group>();
  readonly warnings = new Set<string>();
  readonly ready: Promise<void>;
  private closed = false;
  constructor(
    readonly graph: FoundryParticleGraph,
    models: ParticleModelAsset[],
    readonly poseSource?: { path: string; model: THREE.Object3D },
    previous?: ParticleAssets,
  ) {
    for (const warning of graph.warnings) this.warnings.add(warning);
    this.ready = Promise.all([
      ...graph.textures.map(async (sheet) => {
        const reusable = previous?.textures.get(sheet.path);
        if (reusable?.sheet.dataUrl === sheet.dataUrl) {
          this.textures.set(sheet.path, { texture: reusable.texture, sheet });
          previous?.textures.delete(sheet.path);
          return;
        }
        try {
          const texture = await new THREE.TextureLoader().loadAsync(
            sheet.dataUrl,
          );
          texture.flipY = false;
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          texture.colorSpace = THREE.SRGBColorSpace;
          if (this.closed) {
            texture.dispose();
            return;
          }
          this.textures.set(sheet.path, { texture, sheet });
        } catch {
          this.warnings.add(`Texture unavailable: ${sheet.path}`);
        }
      }),
      ...models.map(async (model) => {
        const reusable = previous?.models.get(model.path);
        if (
          reusable &&
          previous?.modelIds.get(model.path) === model.asset.assetId
        ) {
          this.models.set(model.path, reusable);
          this.modelIds.set(model.path, model.asset.assetId);
          previous.models.delete(model.path);
          previous.modelIds.delete(model.path);
          return;
        }
        const release = retainFoundryModel(model.asset);
        try {
          const gltf = await new GLTFLoader().loadAsync(
            modelAssetUrl(model.asset),
          );
          if (this.closed) {
            disposeModel(gltf.scene);
            return;
          }
          this.models.set(model.path, gltf.scene);
          this.modelIds.set(model.path, model.asset.assetId);
        } catch {
          this.warnings.add(`Model unavailable: ${model.path}`);
        } finally {
          release();
        }
      }),
    ]).then(() => {});
  }
  private readonly modelIds = new Map<string, string>();
  dispose() {
    this.closed = true;
    for (const texture of this.gradients.values()) texture.dispose();
    this.gradients.clear();
    for (const { texture } of this.textures.values()) texture.dispose();
    for (const model of this.models.values()) disposeModel(model);
    this.textures.clear();
    this.models.clear();
    this.modelIds.clear();
  }
}
export function disposeModel(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>(),
    textures = new Set<THREE.Texture>(),
    skeletons = new Set<THREE.Skeleton>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton);
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material))
        if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  for (const value of geometries) value.dispose();
  for (const value of materials) value.dispose();
  for (const value of textures) value.dispose();
  for (const value of skeletons) value.dispose();
}
