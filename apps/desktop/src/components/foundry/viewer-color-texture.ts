import type * as THREE from "three";
import { z } from "zod";

const colorTextureExtras = z.string();

export const colorTextureOf = (material: THREE.Material): string | null => {
  const parsed = colorTextureExtras.safeParse(material.userData.colorTexture);
  return parsed.success ? parsed.data.toLowerCase() : null;
};
