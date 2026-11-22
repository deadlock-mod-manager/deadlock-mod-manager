import * as THREE from "three";

/**
 * The live paint preview, run on the GPU.
 *
 * Baking a paint costs seconds: every affected texture has to be decoded,
 * transformed and re-encoded as BC7 with a full mip chain. That is the right
 * price for the files an export ships, and the wrong price for dragging a color
 * picker. So the preview runs the same recolor in the fragment shader:
 * `vpkmanager::texture_edit::set_color` — set the hue, scale saturation and
 * value — evaluated on the sRGB texel, as Rust does on the 8-bit pixel.
 *
 * The duplication is deliberate but real: this GLSL and the Rust function must
 * stay in step. Change one, change the other.
 */

const PAINT_UNIFORMS = `
uniform float uPaintActive;
uniform float uPaintHue;
uniform float uPaintSaturation;
uniform float uPaintBrightness;
uniform float uPaintHighlight;
uniform vec3 uPaintHighlightColor;

vec3 foundryToSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
vec3 foundryToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

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

// texture_edit::set_color, on the sRGB texel.
vec3 foundryPaint(vec3 srgb) {
  vec3 hsv = foundryRgbToHsv(srgb);
  return foundryHsvToRgb(vec3(
    mod(uPaintHue, 360.0),
    clamp(hsv.y * uPaintSaturation, 0.0, 1.0),
    clamp(hsv.z * uPaintBrightness, 0.0, 1.0)
  ));
}
`;

/**
 * The paint goes on the map sample itself, before three.js multiplies in the
 * material's color factor: the bake rewrites the texture, not the factor.
 * Only materials with a color map get it, since the paint rewrites that map.
 */
const MAP_HOOK = "#include <map_fragment>";
const MAP_MULTIPLY = "diffuseColor *= sampledDiffuseColor;";
const PAINTED_MAP_FRAGMENT = THREE.ShaderChunk.map_fragment.replace(
  MAP_MULTIPLY,
  `if (uPaintActive > 0.5) {
    sampledDiffuseColor.rgb = foundryToLinear(
      foundryPaint(foundryToSrgb(clamp(sampledDiffuseColor.rgb, 0.0, 1.0))));
  }
  ${MAP_MULTIPLY}`,
);

/**
 * Hover and selection glow is added as emission, after the material's own, so
 * it brightens a part without changing the colour the paint preview shows.
 */
const EMISSIVE_HOOK = "#include <emissivemap_fragment>";

/** The glow a hovered or selected section takes, in the app's gold accent. */
const HIGHLIGHT_COLOR = new THREE.Color("#e7c36a");

export interface PaintUniforms {
  uPaintActive: { value: number };
  uPaintHue: { value: number };
  uPaintSaturation: { value: number };
  uPaintBrightness: { value: number };
  /** 0 for none; the hovered part glows brighter than the selected ones. */
  uPaintHighlight: { value: number };
  uPaintHighlightColor: { value: THREE.Color };
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
 * The uniforms start inert, so a material that is never painted renders
 * bit-identically to before.
 */
export const installPaintShader = (
  material: PaintableMaterial,
): PaintUniforms => {
  const uniforms: PaintUniforms = {
    uPaintActive: { value: 0 },
    uPaintHue: { value: 0 },
    uPaintSaturation: { value: 1 },
    uPaintBrightness: { value: 1 },
    uPaintHighlight: { value: 0 },
    uPaintHighlightColor: { value: HIGHLIGHT_COLOR.clone() },
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", `${PAINT_UNIFORMS}\nvoid main() {`)
      .replace(MAP_HOOK, PAINTED_MAP_FRAGMENT)
      .replace(
        EMISSIVE_HOOK,
        `${EMISSIVE_HOOK}
        totalEmissiveRadiance += uPaintHighlightColor * uPaintHighlight;`,
      );
  };

  // Changing onBeforeCompile after a material has been compiled needs a
  // recompile, and the cache key must differ or three.js reuses the old program.
  material.customProgramCacheKey = () => "foundry-paint";
  material.needsUpdate = true;
  return uniforms;
};

/** The hue of a `#rrggbb` color, in degrees, read off the sRGB bytes as the
 *  backend's `hue_of` does (a `THREE.Color` would hand back linear values). */
export const hueOf = (colorHex: string): number => {
  const value = Number.parseInt(colorHex.replace("#", ""), 16) || 0;
  const color = {
    r: ((value >> 16) & 255) / 255,
    g: ((value >> 8) & 255) / 255,
    b: (value & 255) / 255,
  };
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
