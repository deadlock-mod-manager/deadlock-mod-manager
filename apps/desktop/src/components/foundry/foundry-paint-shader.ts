import * as THREE from "three";

/**
 * The live paint preview, run on the GPU.
 *
 * Baking a recolor costs seconds: every affected texture has to be decoded,
 * transformed and re-encoded as BC7 with a full mip chain. That is the right
 * price for the artifact an export ships, and completely the wrong price for
 * dragging a color picker.
 *
 * So the preview does the same transform in a fragment shader instead. It is the
 * identical HSV operation the Rust path applies per texel
 * (`vpkmanager::texture_edit::set_color`), just evaluated per screen pixel — no
 * re-encode, no disk, no reload, and exact rather than the approximation a
 * material tint would give.
 *
 * The duplication is deliberate but real: this GLSL and the Rust function must
 * stay in step. Both are the canonical "set hue, scale saturation and value,
 * leave neutral pixels alone" transform; change one and change the other.
 */

/** Below this saturation a pixel is neutral (white trim, black shadow, grey
 *  metal) and keeps its color, exactly as the Rust path decides. */
const NEUTRAL_SATURATION = 0.08;

const PAINT_UNIFORMS = `
uniform float uPaintActive;
uniform float uPaintHue;
uniform float uPaintSaturation;
uniform float uPaintBrightness;

vec3 foundryRgbToHsv(vec3 c) {
  float maxC = max(c.r, max(c.g, c.b));
  float minC = min(c.r, min(c.g, c.b));
  float delta = maxC - minC;
  float hue = 0.0;
  if (delta > 0.0) {
    if (maxC == c.r) {
      hue = 60.0 * mod((c.g - c.b) / delta, 6.0);
    } else if (maxC == c.g) {
      hue = 60.0 * (((c.b - c.r) / delta) + 2.0);
    } else {
      hue = 60.0 * (((c.r - c.g) / delta) + 4.0);
    }
  }
  float sat = maxC <= 0.0 ? 0.0 : delta / maxC;
  return vec3(hue, sat, maxC);
}

vec3 foundryHsvToRgb(vec3 hsv) {
  float chroma = hsv.z * hsv.y;
  float sector = hsv.x / 60.0;
  float x = chroma * (1.0 - abs(mod(sector, 2.0) - 1.0));
  vec3 rgb;
  if (sector < 1.0)      rgb = vec3(chroma, x, 0.0);
  else if (sector < 2.0) rgb = vec3(x, chroma, 0.0);
  else if (sector < 3.0) rgb = vec3(0.0, chroma, x);
  else if (sector < 4.0) rgb = vec3(0.0, x, chroma);
  else if (sector < 5.0) rgb = vec3(x, 0.0, chroma);
  else                   rgb = vec3(chroma, 0.0, x);
  return rgb + (hsv.z - chroma);
}

vec3 foundryPaint(vec3 color) {
  vec3 hsv = foundryRgbToHsv(color);
  if (hsv.y < ${NEUTRAL_SATURATION.toFixed(3)}) {
    // Neutral pixels keep their hue; only brightness may move, matching the
    // Rust path so white trim does not suddenly take the paint color.
    return clamp(color * uPaintBrightness, 0.0, 1.0);
  }
  return foundryHsvToRgb(vec3(
    mod(uPaintHue, 360.0),
    clamp(hsv.y * uPaintSaturation, 0.0, 1.0),
    clamp(hsv.z * uPaintBrightness, 0.0, 1.0)
  ));
}
`;

/**
 * three.js hands the sampled albedo to the lighting model as `diffuseColor`, so
 * the paint is applied right after the map is read and before anything is lit.
 */
const MAP_HOOK = "#include <map_fragment>";

export interface PaintUniforms {
  uPaintActive: { value: number };
  uPaintHue: { value: number };
  uPaintSaturation: { value: number };
  uPaintBrightness: { value: number };
}

/** Material types whose shader the paint preview can hook into. */
export type PaintableMaterial =
  | THREE.MeshBasicMaterial
  | THREE.MeshStandardMaterial
  | THREE.MeshPhysicalMaterial
  | THREE.MeshPhongMaterial
  | THREE.MeshLambertMaterial;

/**
 * Install the paint shader on a material and return its uniforms.
 *
 * The uniforms start inert (`uPaintActive = 0`), so a material that is never
 * painted renders bit-identically to before.
 */
export const installPaintShader = (
  material: PaintableMaterial,
): PaintUniforms => {
  const uniforms: PaintUniforms = {
    uPaintActive: { value: 0 },
    uPaintHue: { value: 0 },
    uPaintSaturation: { value: 1 },
    uPaintBrightness: { value: 1 },
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", `${PAINT_UNIFORMS}\nvoid main() {`)
      .replace(
        MAP_HOOK,
        `${MAP_HOOK}
        if (uPaintActive > 0.5) {
          diffuseColor.rgb = foundryPaint(diffuseColor.rgb);
        }`,
      );
  };

  // Changing onBeforeCompile after a material has been compiled needs a
  // recompile, and the cache key must differ or three.js reuses the old program.
  material.customProgramCacheKey = () => "foundry-paint";
  material.needsUpdate = true;
  return uniforms;
};

/** The hue of a `#rrggbb` color, in degrees. */
export const hueOf = (colorHex: string): number => {
  const color = new THREE.Color(colorHex);
  const max = Math.max(color.r, color.g, color.b);
  const min = Math.min(color.r, color.g, color.b);
  const delta = max - min;
  if (delta <= 0) return 0;
  let hue: number;
  if (max === color.r) {
    hue = 60 * (((color.g - color.b) / delta) % 6);
  } else if (max === color.g) {
    hue = 60 * ((color.b - color.r) / delta + 2);
  } else {
    hue = 60 * ((color.r - color.g) / delta + 4);
  }
  return ((hue % 360) + 360) % 360;
};
