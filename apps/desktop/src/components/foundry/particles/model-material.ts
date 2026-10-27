import * as THREE from "three";
import type { ParticleAssets } from "./assets";
import { fields, list, num, str, type Fields } from "./values";

export const cloneParticleModelMaterial = (
  source: THREE.Material,
  op: Fields,
  assets: ParticleAssets,
): THREE.Material | null => {
  const path = str(op.m_hOverrideMaterial);
  if (!path) return source.clone();
  const override = fields(assets.graph.materials[path]);
  const unsupported = list(override.m_intParams)
    .map(fields)
    .filter(
      (flag) =>
        num(flag.m_nValue) !== 0 &&
        [
          "F_ADVANCED_TRANSLUCENCY",
          "F_JITTER_VERTICES",
          "F_ENABLE_TEXTURE_TRANSFORMS",
        ].includes(str(flag.m_name)),
    );
  if (unsupported.length) {
    assets.warnings.add(
      `Unsupported model material features: ${path} (${unsupported.map((flag) => str(flag.m_name)).join(", ")})`,
    );
    return null;
  }
  const textures = list(override.m_textureParams).map(fields);
  const color =
    textures.find((p) => str(p.m_name) === "g_tColor") ??
    textures.find((p) => /Color|Mask/.test(str(p.m_name))) ??
    textures[0];
  const material = new THREE.MeshBasicMaterial({
    map: assets.textures.get(str(color?.m_pValue))?.texture ?? null,
    alphaMap:
      assets.textures.get(
        str(
          textures.find((ref) => str(ref.m_name) === "g_tAltTranslucency")
            ?.m_pValue,
        ),
      )?.texture ?? null,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const tint = list(override.m_vectorParams)
    .map(fields)
    .find((p) => str(p.m_name) === "g_vColorTint");
  if (tint) {
    const value = list(tint.m_value);
    material.color.setRGB(num(value[0], 1), num(value[1], 1), num(value[2], 1));
  }
  return material;
};
