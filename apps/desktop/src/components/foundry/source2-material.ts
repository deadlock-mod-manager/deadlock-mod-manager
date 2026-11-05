import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { z } from "zod";
import type { PaintableMaterial } from "./workbench-paint-shader";

const vector = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);
const colorSchema = z.object({
  tint: vector,
  tintMode: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  contrastSaturationBrightness: vector,
  reflectivity: vector,
  maskColorTint: z.boolean(),
  maskVertexColor: z.boolean(),
  vertexColorBeforeCorrection: z.boolean(),
  vertexColorStrength: z.number().finite().min(0).max(1),
  tintMaskTexture: z.number().int().nonnegative().nullable(),
});
const metadataSchema = z.object({
  schemaVersion: z.literal(1),
  shader: z.string(),
  blendMode: z.enum(["opaque", "translucent", "additive"]),
  unlit: z.boolean(),
  color: colorSchema.nullable(),
});
type Source2Color = z.infer<typeof colorSchema>;

const hasVertexColors = (material: THREE.Material) =>
  "vertexColors" in material && material.vertexColors === true;

const needsTintMask = (material: THREE.Material, color: Source2Color) =>
  (color.maskColorTint &&
    (color.tintMode !== 0 || color.tint.some((value) => value !== 1))) ||
  (hasVertexColors(material) &&
    color.maskVertexColor &&
    color.vertexColorStrength !== 0);

export const source2Metadata = (material: THREE.Material) => {
  const parsed = metadataSchema.safeParse(material.userData.source2);
  return parsed.success ? parsed.data : null;
};

export const sceneMaterials = (root: THREE.Object3D) => {
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material]) {
        materials.add(material);
      }
    }
  });
  return materials;
};

export async function loadSource2Textures(gltf: GLTF, textureOffset = 0) {
  const indices = new Set<number>();
  for (const material of sceneMaterials(gltf.scene)) {
    const color = source2Metadata(material)?.color;
    const index =
      color && needsTintMask(material, color) ? color.tintMaskTexture : null;
    if (index != null) indices.add(index);
  }
  const textures = new Map<number, THREE.Texture>();
  await Promise.all(
    [...indices].map(async (index) => {
      // Optional masks may be absent in incomplete mods. Keep the glTF fallback there.
      try {
        const texture: THREE.Texture = await gltf.parser.getDependency(
          "texture",
          index,
        );
        texture.colorSpace = THREE.NoColorSpace;
        textures.set(index + textureOffset, texture);
      } catch {
        /* The affected material retains its exported fallback tint. */
      }
    }),
  );
  if (textureOffset) {
    for (const material of sceneMaterials(gltf.scene)) {
      const data = source2Metadata(material);
      if (data?.color?.tintMaskTexture != null)
        material.userData.source2 = {
          ...data,
          color: {
            ...data.color,
            tintMaskTexture: data.color.tintMaskTexture + textureOffset,
          },
        };
    }
  }
  return textures;
}

// MatrixColorCorrect2/MatrixColorTint3 semantics, following Grimoire and VRF.
// See LICENSE.grimoire for the upstream notice and preview-materials.md for scope.
const weights = new THREE.Vector3(0.2126 ** 2, 0.7152 ** 2, 0.0722 ** 2);
weights.divideScalar(weights.x + weights.y + weights.z);
export function colorCorrection(
  csb: readonly number[],
  reflectivity: readonly number[],
) {
  const [contrast, saturation, brightness] = csb;
  const w = weights.toArray();
  const matrix = new THREE.Matrix3().set(
    saturation + (1 - saturation) * w[0],
    (1 - saturation) * w[1],
    (1 - saturation) * w[2],
    (1 - saturation) * w[0],
    saturation + (1 - saturation) * w[1],
    (1 - saturation) * w[2],
    (1 - saturation) * w[0],
    (1 - saturation) * w[1],
    saturation + (1 - saturation) * w[2],
  );
  const offset = new THREE.Vector3(...reflectivity)
    .multiplyScalar((1 - contrast) * brightness)
    .applyMatrix3(matrix);
  matrix.multiplyScalar(contrast * brightness);
  return { matrix, offset };
}
export function colorTint(tint: readonly number[], mode: number) {
  const [r, g, b] = tint;
  if (mode !== 1)
    return {
      matrix: new THREE.Matrix3().set(
        r * (mode === 2 ? 2 : 1),
        0,
        0,
        0,
        g * (mode === 2 ? 2 : 1),
        0,
        0,
        0,
        b * (mode === 2 ? 2 : 1),
      ),
      offset: new THREE.Vector3(),
    };
  const peak = Math.max(r, g, b);
  const saturation = peak === 0 ? 0 : (peak - Math.min(r, g, b)) / peak;
  const diagonal = 1 - saturation;
  const scale = 1 - saturation * saturation * 0.85 - diagonal;
  const [x, y, z] = weights.toArray().map((value) => value * scale);
  const matrix = new THREE.Matrix3().set(
    diagonal + x,
    y,
    z,
    x,
    diagonal + y,
    z,
    x,
    y,
    diagonal + z,
  );
  const color = new THREE.Vector3(r, g, b);
  return {
    matrix,
    offset: color.clone().sub(color.clone().applyMatrix3(matrix)),
  };
}

export function applySource2DrawState(
  mesh: THREE.Mesh,
  material: THREE.Material,
) {
  const data = source2Metadata(material);
  if (!data) return;
  if (data.unlit) material.toneMapped = false;
  if (data.blendMode === "additive") {
    material.transparent = true;
    material.blending = THREE.AdditiveBlending;
    material.depthTest = true;
    material.depthWrite = false;
    mesh.renderOrder = Math.max(mesh.renderOrder, 2);
  } else if (data.blendMode === "translucent") {
    material.transparent = true;
    // Source 2 translucent bodies write depth; glTF BLEND defaults to no depth writes.
    material.depthWrite = true;
    mesh.renderOrder = Math.max(mesh.renderOrder, 1);
  }
  material.needsUpdate = true;
}

const editorColorOverrides = new WeakMap<
  THREE.Material,
  (values: ReadonlyMap<string, readonly number[]>) => void
>();
export function updateSource2Color(
  material: THREE.Material,
  values: ReadonlyMap<string, readonly number[]>,
) {
  editorColorOverrides.get(material)?.(values);
}

export function installSource2Color(
  material: PaintableMaterial,
  textures: ReadonlyMap<number, THREE.Texture>,
  editing = false,
) {
  const data = source2Metadata(material);
  const color = data?.color;
  if (!color || data.shader.toLowerCase() !== "pbr.vfx") return false;
  // Only remove the factor owned by this exporter/schema. Imported and edited GLBs stay intact.
  if (
    material.color
      .toArray()
      .some((value, index) => Math.abs(value - color.tint[index]) > 1e-6)
  )
    return false;
  if (
    !editing &&
    !hasVertexColors(material) &&
    color.tintMode === 0 &&
    color.tint.every((value) => value === 1) &&
    color.contrastSaturationBrightness.every((value) => value === 1)
  )
    return false;
  const maskIndex = needsTintMask(material, color)
    ? color.tintMaskTexture
    : null;
  const mask = maskIndex === null ? null : textures.get(maskIndex);
  if (maskIndex !== null && !mask) return false;
  const correction = colorCorrection(
    color.contrastSaturationBrightness,
    color.reflectivity,
  );
  const tint = colorTint(color.tint, color.tintMode);
  const uniforms = {
    uSource2Correction: { value: correction.matrix },
    uSource2CorrectionOffset: { value: correction.offset },
    uSource2Tint: { value: tint.matrix },
    uSource2TintOffset: { value: tint.offset },
    uSource2TintMask: { value: mask },
    uSource2MaskTint: { value: color.maskColorTint ? 1 : 0 },
    uSource2MaskVertex: { value: color.maskVertexColor ? 1 : 0 },
    uSource2VertexStrength: { value: color.vertexColorStrength },
  };
  editorColorOverrides.set(material, (values) => {
    const next = colorCorrection(
      values.get("g_vAlbedoContrastSaturationBrightness1") ??
        color.contrastSaturationBrightness,
      color.reflectivity,
    );
    uniforms.uSource2Correction.value.copy(next.matrix);
    uniforms.uSource2CorrectionOffset.value.copy(next.offset);
    const raw = values.get("g_vColorTint1");
    const tintValue = raw
      ? new THREE.Color(raw[0], raw[1], raw[2]).convertSRGBToLinear().toArray()
      : color.tint;
    const nextTint = colorTint(tintValue, color.tintMode);
    uniforms.uSource2Tint.value.copy(nextTint.matrix);
    uniforms.uSource2TintOffset.value.copy(nextTint.offset);
    uniforms.uSource2MaskTint.value =
      values.get("g_bMaskColorTint1")?.[0] ?? (color.maskColorTint ? 1 : 0);
    uniforms.uSource2MaskVertex.value =
      values.get("g_bMaskVertexColorTint1")?.[0] ??
      (color.maskVertexColor ? 1 : 0);
    uniforms.uSource2VertexStrength.value =
      values.get("g_fVertexColorStrength1")?.[0] ?? color.vertexColorStrength;
  });
  const previous = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.color.setRGB(1, 1, 1);
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = `
uniform mat3 uSource2Correction;
uniform vec3 uSource2CorrectionOffset;
uniform mat3 uSource2Tint;
uniform vec3 uSource2TintOffset;
uniform sampler2D uSource2TintMask;
uniform float uSource2MaskTint;
uniform float uSource2MaskVertex;
uniform float uSource2VertexStrength;
${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
float source2Mask = 1.0;
${mask ? "#ifdef USE_MAP\nsource2Mask = texture2D(uSource2TintMask, vMapUv).r;\n#endif" : ""}
vec3 source2Vertex = vec3(1.0);
#if defined(USE_COLOR) || defined(USE_COLOR_ALPHA)
source2Vertex = vColor.rgb;
#endif
float source2VertexAmount = mix(1.0, source2Mask, uSource2MaskVertex) * uSource2VertexStrength;
${color.vertexColorBeforeCorrection ? "diffuseColor.rgb *= mix(vec3(1.0), source2Vertex, source2VertexAmount);" : ""}
diffuseColor.rgb = uSource2Correction * diffuseColor.rgb + uSource2CorrectionOffset;
diffuseColor.rgb = mix(diffuseColor.rgb, uSource2Tint * diffuseColor.rgb + uSource2TintOffset, mix(1.0, source2Mask, uSource2MaskTint));
${color.vertexColorBeforeCorrection ? "" : "diffuseColor.rgb *= mix(vec3(1.0), source2Vertex, source2VertexAmount);"}`,
    );
    // Vertex RGB was consumed in the authored order above; preserve vertex opacity separately.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `
#ifdef USE_COLOR_ALPHA
diffuseColor.a *= vColor.a;
#endif`,
    );
  };
  material.customProgramCacheKey = () =>
    `${key}:source2-color-v1:${mask ? 1 : 0}:${color.vertexColorBeforeCorrection ? 1 : 0}`;
  material.needsUpdate = true;
  return true;
}

export const disposeSource2Textures = (
  textures: ReadonlyMap<number, THREE.Texture>,
) => {
  const bitmaps = new Set<ImageBitmap>();
  for (const texture of new Set(textures.values())) {
    texture.dispose();
    const image = texture.source.data;
    if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap)
      bitmaps.add(image);
  }
  for (const bitmap of bitmaps) bitmap.close();
};
