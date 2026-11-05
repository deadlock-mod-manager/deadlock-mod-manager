import * as THREE from "three";
import { z } from "zod";
import { sceneMaterials } from "./source2-material";

const materialPath = z.string().min(1);

/** Source GLBs from one decode bundle repeat the same compiled material images per mesh/LOD. */
export function shareSourceModelImages(
  scene: THREE.Group,
  masks: ReadonlyMap<number, THREE.Texture>,
) {
  const canonical = new Map<string, THREE.Texture["source"]>();
  const textures = new Set<THREE.Texture>();
  const replaced = new Set<ImageBitmap>();
  const share = (key: string, texture: THREE.Texture) => {
    textures.add(texture);
    if (!texture.name) return;
    const identity = JSON.stringify([
      key,
      texture.name,
      texture.format,
      texture.type,
    ]);
    const source = canonical.get(identity);
    if (!source) {
      canonical.set(identity, texture.source);
      return;
    }
    if (source === texture.source) return;
    const image = texture.source.data;
    if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap)
      replaced.add(image);
    texture.source = source;
  };
  for (const material of sceneMaterials(scene)) {
    const path = materialPath.safeParse(material.userData.sourceMaterial);
    for (const [slot, value] of Object.entries(material)) {
      if (!(value instanceof THREE.Texture)) continue;
      textures.add(value);
      if (path.success) share(`${path.data}:${slot}`, value);
    }
  }
  for (const mask of masks.values()) share("tint-mask", mask);
  const liveImages = new Set(
    [...textures].map((texture) => texture.source.data),
  );
  for (const image of replaced) if (!liveImages.has(image)) image.close();
}
