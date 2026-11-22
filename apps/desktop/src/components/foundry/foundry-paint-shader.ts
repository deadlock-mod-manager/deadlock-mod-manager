import * as THREE from "three";

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

const EMISSIVE_HOOK = "#include <emissivemap_fragment>";

const HIGHLIGHT_COLOR = new THREE.Color("#e7c36a");

export interface PaintUniforms {
  uPaintActive: { value: number };
  uPaintHue: { value: number };
  uPaintSaturation: { value: number };
  uPaintBrightness: { value: number };
  uPaintHighlight: { value: number };
  uPaintHighlightColor: { value: THREE.Color };
}

export type PaintableMaterial =
  | THREE.MeshBasicMaterial
  | THREE.MeshStandardMaterial
  | THREE.MeshPhysicalMaterial
  | THREE.MeshPhongMaterial
  | THREE.MeshLambertMaterial;

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

  material.customProgramCacheKey = () => "foundry-paint";
  material.needsUpdate = true;
  return uniforms;
};

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
