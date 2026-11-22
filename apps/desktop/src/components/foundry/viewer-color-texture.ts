import type * as THREE from "three";
import { z } from "zod";

/** `material.userData.colorTexture`, written by our GLB exporter's material extras. */
const colorTextureExtras = z.string();

/** The color map the decoder recorded for a material, lowercased. */
export const colorTextureOf = (material: THREE.Material): string | null => {
  const parsed = colorTextureExtras.safeParse(material.userData.colorTexture);
  return parsed.success ? parsed.data.toLowerCase() : null;
};
