import * as THREE from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { z } from "zod";

const imageDimensions = z.object({
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});

export interface ModelScene {
  scene: THREE.Group;
  source2Textures: Map<number, THREE.Texture>;
}
export interface ModelSceneLease extends ModelScene {
  dispose(): void;
}

const resources = (model: ModelScene) => {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set(model.source2Textures.values());
  const skeletons = new Set<THREE.Skeleton>();
  model.scene.traverse((object) => {
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
  return { geometries, materials, textures, skeletons };
};

export function disposeModelScene(model: ModelScene, closeImages = true) {
  const owned = resources(model);
  for (const collection of [
    owned.geometries,
    owned.materials,
    owned.textures,
    owned.skeletons,
  ]) {
    for (const item of collection) item.dispose();
  }
  if (!closeImages) return;
  const images = new Set<ImageBitmap>();
  for (const texture of owned.textures) {
    const image = texture.source.data;
    if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap)
      images.add(image);
  }
  for (const image of images) image.close();
}

/** A viewer owns its geometry, skeletons and texture settings; decoded images stay leased. */
export function cloneModelScene(model: ModelScene): ModelScene {
  const scene = clone(model.scene) as THREE.Group;
  const geometries = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  const textures = new Map<THREE.Texture, THREE.Texture>();
  const textureCopy = (texture: THREE.Texture) => {
    let copy = textures.get(texture);
    if (!copy) {
      copy = texture.clone();
      textures.set(texture, copy);
    }
    return copy;
  };
  const materialCopy = (material: THREE.Material) => {
    const copy = material.clone();
    for (const [key, value] of Object.entries(material))
      if (value instanceof THREE.Texture)
        Reflect.set(copy, key, textureCopy(value));
    return copy;
  };
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry: THREE.BufferGeometry =
      geometries.get(object.geometry) ?? object.geometry.clone();
    geometries.set(object.geometry, geometry);
    object.geometry = geometry;
    object.material = Array.isArray(object.material)
      ? object.material.map(materialCopy)
      : materialCopy(object.material);
  });
  return {
    scene,
    source2Textures: new Map(
      [...model.source2Textures].map(([key, texture]) => [
        key,
        textureCopy(texture),
      ]),
    ),
  };
}

export function modelSceneBytes(model: ModelScene) {
  const owned = resources(model);
  const buffers = new Set<ArrayBufferLike>();
  let bytes = 0;
  for (const geometry of owned.geometries) {
    const attributes = [
      ...Object.values(geometry.attributes),
      ...Object.values(geometry.morphAttributes).flat(),
    ];
    if (geometry.index) attributes.push(geometry.index);
    for (const attribute of attributes) {
      const array =
        attribute instanceof THREE.InterleavedBufferAttribute
          ? attribute.data.array
          : attribute.array;
      if (buffers.has(array.buffer)) continue;
      buffers.add(array.buffer);
      bytes += array.buffer.byteLength;
    }
  }
  const sources = new Set<THREE.Texture["source"]>();
  for (const texture of owned.textures) {
    if (sources.has(texture.source)) continue;
    sources.add(texture.source);
    const image = imageDimensions.safeParse(texture.source.data);
    if (image.success)
      bytes += (image.data.width * image.data.height * 4 * 4) / 3;
  }
  return bytes;
}
