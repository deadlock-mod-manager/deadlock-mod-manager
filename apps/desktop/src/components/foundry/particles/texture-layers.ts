import * as THREE from "three";
import { bool, fields, list, num, str, vec, type Fields } from "./values";

export const CHANNELS = [
  "MIX_RGB",
  "MIX_RGBA",
  "MIX_A",
  "MIX_RGB_A",
  "MIX_RGB_ALPHAMASK",
  "MIX_RGB_RGBMASK",
  "MIX_RGBA_RGBALPHA",
  "MIX_A_RGBALPHA",
  "MIX_RGB_A_RGBALPHA",
  "MIX_R",
  "MIX_G",
  "MIX_B",
  "MIX_RALPHA",
  "MIX_GALPHA",
  "MIX_BALPHA",
];
export const BLENDS = [
  "MULTIPLY",
  "MOD2X",
  "REPLACE",
  "ADD",
  "SUBTRACT",
  "AVERAGE",
  "LUMINANCE",
];
export const EFFECTS = [
  "DIFFUSE",
  "ZOOM",
  "1D_COLOR_LOOKUP",
  "UVDISTORTION",
  "UVDISTORTION_ZOOM",
];
export const layers = (op: Fields) => {
  const values = list(op.m_vecTexturesInput)
    .map(fields)
    .filter(
      (ref) =>
        bool(ref.m_bEnabled, true) &&
        str(ref.m_nTextureType) !== "SPRITECARD_TEXTURE_NORMALMAP" &&
        str(ref.m_nTextureType) !== "SPRITECARD_TEXTURE_ANIMMOTIONVEC",
    );
  return values.length
    ? values.slice(0, 5)
    : [
        {
          m_hTexture: str(
            op.m_hTexture,
            str(op["_class"]) === "C_OP_RenderSprites"
              ? "materials/particle/base_sprite.vtex"
              : "materials/particle/base_trail.vtex",
          ),
        },
      ];
};
export const layerIndex = (
  ref: Fields,
  key: string,
  prefix: string,
  names: string[],
  fallback: number,
) => {
  const index = names.indexOf(str(ref[key]).replace(prefix, ""));
  return index < 0 ? fallback : index;
};
export function gradientTexture(ref: Fields): THREE.DataTexture {
  const stops = list(fields(ref.m_Gradient).m_Stops).map(fields),
    data = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let a = stops[0] ?? {},
      b = stops[stops.length - 1] ?? {};
    for (let j = 1; j < stops.length; j++)
      if (t <= num(stops[j].m_flPosition)) {
        a = stops[j - 1];
        b = stops[j];
        break;
      }
    const f = THREE.MathUtils.clamp(
        (t - num(a.m_flPosition)) /
          (num(b.m_flPosition) - num(a.m_flPosition) || 1),
        0,
        1,
      ),
      color = vec(a.m_Color, 255).lerp(vec(b.m_Color, 255), f);
    data[i * 4] = color.x;
    data[i * 4 + 1] = color.y;
    data[i * 4 + 2] = color.z;
    data[i * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, 256, 1);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}
