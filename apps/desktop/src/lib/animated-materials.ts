import * as THREE from "three";
import { z } from "zod";
import { addMaterialShaderHook } from "./material-shader-hooks";

const vector = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);
const effectSchema = z.object({
  shader: z.string().max(512),
  material: z.string().max(512),
  floats: z.record(z.string(), z.number().finite()),
  vectors: z.record(z.string(), vector),
  flags: z.record(z.string(), z.number().finite()),
  textures: z.record(z.string(), z.string()),
  maskTexture: z.number().int().nonnegative().optional(),
});
type Source2Effect = z.infer<typeof effectSchema>;
export type MaterialFamily =
  | "surface"
  | "flame"
  | "sparkle"
  | "slime"
  | "smoke"
  | "spectral";

/** Narrow material-name cases: never turn a hero's entire model into an FX shader. */
export function materialFamily(
  effect: Pick<Source2Effect, "shader" | "material">,
): MaterialFamily {
  const name = effect.material.toLowerCase();
  const shader = effect.shader.toLowerCase();
  if (
    /(inferno|infernus)/.test(name) &&
    /(flame|fire_hair|hair_flame)/.test(name)
  )
    return "flame";
  if (name.includes("lash") && name.includes("sparkle")) return "sparkle";
  if (name.includes("viscous") && /(slime|glass|swatch)/.test(name))
    return "slime";
  if (/spectral|ghost/.test(shader) || /haze.*spectral/.test(name))
    return "spectral";
  if (/smoke/.test(shader) || /haze.*(?:head|ui)_smoke/.test(name))
    return "smoke";
  return "surface";
}

function scalar(
  effect: Source2Effect,
  names: string[],
  fallback: number,
): number {
  for (const name of names) {
    const value =
      effect.floats[name] ??
      Object.entries(effect.floats).find(
        ([key]) => key.toLowerCase() === name.toLowerCase(),
      )?.[1];
    if (value !== undefined) return value;
  }
  return fallback;
}

function vec(
  effect: Source2Effect,
  names: string[],
  fallback: [number, number, number, number],
): [number, number, number, number] {
  for (const name of names) {
    const value =
      effect.vectors[name] ??
      Object.entries(effect.vectors).find(
        ([key]) => key.toLowerCase() === name.toLowerCase(),
      )?.[1];
    if (value) return value;
  }
  return fallback;
}

const COMMON = `
uniform float uSourceTime;
uniform vec2 uSourceScroll;
uniform vec2 uSourceScale;
uniform vec2 uSourceOffset;
uniform float uSourceRotation;
uniform vec2 uSourceEmissionScroll;
uniform mat3 uSourceJitter;
uniform mat3 uSourceJitterB;
uniform vec3 uSourceJitterFrequency;
uniform vec3 uSourceJitterFrequencyB;
uniform float uSourceJitterSpeedB;
uniform float uSourceJitterSpeed;
uniform float uSourceJitterQuantize;
uniform float uSourceJitterQuantizeDisplacement;
uniform float uSourceOpacity;
uniform float uSourceRim;
uniform float uSourceWipe;
uniform sampler2D uSourceMask;
uniform float uSourceHasMask;
uniform float uSourceMaskIsAlpha;
uniform vec3 uSourceEmission;
uniform float uSourceEmissionAlbedo;
uniform vec2 uSourceEmissionScale;
uniform vec2 uSourceEmissionOffset;
uniform float uSourceEmissionRotation;
varying vec2 vSourceUv;
vec2 sourceTransform(vec2 value, vec2 scroll) {
  float c = cos(uSourceRotation), s = sin(uSourceRotation);
  return mat2(c, -s, s, c) * ((value - 0.5) * uSourceScale) + 0.5 + uSourceOffset + scroll * uSourceTime;
}
vec2 sourceEmissionTransform(vec2 value) {
  float c = cos(uSourceEmissionRotation), s = sin(uSourceEmissionRotation);
  return mat2(c, -s, s, c) * ((value - 0.5) * uSourceEmissionScale) + 0.5 + uSourceEmissionOffset + uSourceEmissionScroll * uSourceTime;
}
`;

export interface AnimatedMaterials {
  update(timeSeconds: number): void;
  dispose(): void;
  diagnostics: string[];
}

/** All animation is a pure function of PreviewClock time, including backwards seeks. */
export async function installAnimatedMaterials(
  root: THREE.Object3D,
  loadTexture?: (index: number) => Promise<THREE.Texture>,
): Promise<AnimatedMaterials> {
  const materials = new Set<THREE.MeshStandardMaterial>();
  const borrowedTextures = new Set<THREE.Texture>();
  const borrowedSources = new Set<THREE.Texture["source"]>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      if (
        material instanceof THREE.MeshBasicMaterial ||
        material instanceof THREE.MeshLambertMaterial ||
        material instanceof THREE.MeshPhongMaterial
      ) {
        for (const texture of [
          material.map,
          material.alphaMap,
          material.envMap,
        ]) {
          if (texture) {
            borrowedTextures.add(texture);
            borrowedSources.add(texture.source);
          }
        }
      }
      if (material instanceof THREE.MeshStandardMaterial) {
        materials.add(material);
        for (const texture of [
          material.map,
          material.normalMap,
          material.alphaMap,
          material.emissiveMap,
          material.roughnessMap,
          material.metalnessMap,
          material.aoMap,
          material.lightMap,
          material.bumpMap,
          material.displacementMap,
          material.envMap,
        ]) {
          if (texture) {
            borrowedTextures.add(texture);
            borrowedSources.add(texture.source);
          }
        }
      }
      if (material instanceof THREE.MeshPhysicalMaterial) {
        for (const texture of [
          material.clearcoatMap,
          material.clearcoatNormalMap,
          material.clearcoatRoughnessMap,
          material.transmissionMap,
          material.thicknessMap,
          material.sheenColorMap,
          material.sheenRoughnessMap,
          material.specularColorMap,
          material.specularIntensityMap,
          material.iridescenceMap,
          material.iridescenceThicknessMap,
          material.anisotropyMap,
        ]) {
          if (texture) {
            borrowedTextures.add(texture);
            borrowedSources.add(texture.source);
          }
        }
      }
    }
  });
  const borrowedImages = new Set<ImageBitmap>();
  if (typeof ImageBitmap !== "undefined") {
    for (const source of borrowedSources) {
      if (source.data instanceof ImageBitmap) borrowedImages.add(source.data);
    }
  }
  const diagnostics: string[] = [];
  const clocks: { value: number }[] = [];
  const cleanups: (() => void)[] = [];
  const maskRequests = new Map<number, Promise<THREE.Texture>>();
  const maskClones = new Map<THREE.Texture, THREE.Texture>();
  for (const material of materials) {
    if (material.userData.source2Effect === undefined) continue;
    const parsed = effectSchema.safeParse(material.userData.source2Effect);
    if (!parsed.success) {
      diagnostics.push(
        `${material.name}: invalid Source 2 material parameters`,
      );
      continue;
    }
    const effect = parsed.data;
    const family = materialFamily(effect);
    const scroll = vec(
      effect,
      [
        "g_vAlbedoScrollSpeed1",
        "g_vAlbedoScrollSpeed",
        "g_vTranslucentScrollSpeed0_1",
        "g_vTranslucentScrollSpeed1",
      ],
      [0, 0, 0, 0],
    );
    const emissionScroll = vec(
      effect,
      ["g_vSelfIllumScrollSpeed1", "g_vSelfIllumScrollSpeed"],
      scroll,
    );
    const scale = vec(
      effect,
      ["g_vTexCoordScale1", "g_vTexCoordScale", "g_vAlbedoTexCoordScale1"],
      [1, 1, 1, 1],
    );
    const offset = vec(
      effect,
      ["g_vTexCoordOffset1", "g_vTexCoordOffset", "g_vAlbedoTexCoordOffset1"],
      [0, 0, 0, 0],
    );
    const jitter = vec(
      effect,
      [
        "g_vJitterAmplitudesXA1",
        "g_vJitterAmplitudesXA",
        "g_vJitterExpression1",
        "g_vJitterExpression",
      ],
      [0, 0, 0, 0],
    );
    const jitterY = vec(
      effect,
      ["g_vJitterAmplitudesYA1", "g_vJitterAmplitudesYA"],
      jitter,
    );
    const jitterZ = vec(
      effect,
      ["g_vJitterAmplitudesZA1", "g_vJitterAmplitudesZA"],
      jitter,
    );
    const jitterB = vec(
      effect,
      ["g_vJitterAmplitudesXB1", "g_vJitterAmplitudesXB"],
      [0, 0, 0, 0],
    );
    const jitterFrequency = vec(
      effect,
      ["g_vJitterFrequenciesA1", "g_vJitterFrequenciesA"],
      [1, 1, 1, 0],
    );
    const jitterYB = vec(
      effect,
      ["g_vJitterAmplitudesYB1", "g_vJitterAmplitudesYB"],
      [0, 0, 0, 0],
    );
    const jitterZB = vec(
      effect,
      ["g_vJitterAmplitudesZB1", "g_vJitterAmplitudesZB"],
      [0, 0, 0, 0],
    );
    const jitterFrequencyB = vec(
      effect,
      ["g_vJitterFrequenciesB1", "g_vJitterFrequenciesB"],
      [1, 1, 1, 0],
    );
    const emissionScale = vec(
      effect,
      ["g_vSelfIllumTexcoordScale1", "g_vSelfIllumTexcoordScale"],
      scale,
    );
    const emissionOffset = vec(
      effect,
      ["g_vSelfIllumTexcoordOffset1", "g_vSelfIllumTexcoordOffset"],
      offset,
    );
    const emissionTint = vec(
      effect,
      ["g_vSelfIllumTint1", "g_vSelfIllumTint"],
      [1, 1, 1, 1],
    );
    const emissionStrength =
      effect.flags.F_SELF_ILLUM === 1 && !material.emissiveMap
        ? Math.max(
            0,
            scalar(effect, ["g_flSelfIllumScale1", "g_flSelfIllumScale"], 1),
          )
        : 0;
    const hasJitter = [
      ...jitter,
      ...jitterY,
      ...jitterZ,
      ...jitterB,
      ...jitterYB,
      ...jitterZB,
    ].some((value) => value !== 0);
    const rotation = scalar(
      effect,
      [
        "g_flAlbedoTexcoordRotation1",
        "g_flAlbedoTexcoordRotation",
        "g_flTexCoordRotation1",
        "g_flTexCoordRotation",
      ],
      0,
    );
    const opacity = scalar(
      effect,
      ["g_flOpacityScale1", "g_flOpacityScale", "g_flAlphaScale"],
      1,
    );
    const active =
      family !== "surface" ||
      [
        ...scroll,
        ...emissionScroll,
        ...jitter,
        ...jitterY,
        ...jitterZ,
        ...offset,
      ].some((value) => value !== 0) ||
      scale[0] !== 1 ||
      scale[1] !== 1 ||
      emissionStrength > 0 ||
      effect.flags.F_ADDITIVE_BLEND === 1 ||
      effect.flags.F_ADDITIVE === 1 ||
      rotation !== 0 ||
      opacity !== 1 ||
      hasJitter;
    if (!active) continue;
    let mask: THREE.Texture | null = null;
    if (effect.maskTexture !== undefined && loadTexture) {
      try {
        // Clone sampler state; these linear masks must not change a shared color map.
        let request = maskRequests.get(effect.maskTexture);
        if (!request) {
          request = loadTexture(effect.maskTexture);
          maskRequests.set(effect.maskTexture, request);
        }
        const original = await request;
        mask = maskClones.get(original) ?? null;
        if (!mask) {
          mask = original.clone();
          // Paint can replace a color map's image; a mask keeps its original pixels.
          mask.source = new THREE.Source(original.source.data);
          mask.colorSpace = THREE.NoColorSpace;
          mask.wrapS = mask.wrapT = THREE.RepeatWrapping;
          mask.needsUpdate = true;
          maskClones.set(original, mask);
        }
      } catch {
        diagnostics.push(`${effect.material}: material mask unavailable`);
      }
    }
    const old = {
      blending: material.blending,
      transparent: material.transparent,
      depthWrite: material.depthWrite,
      emissive: material.emissive.clone(),
      emissiveIntensity: material.emissiveIntensity,
    };
    if (effect.flags.F_SELF_ILLUM === 1 && material.emissiveMap) {
      material.emissive.setRGB(
        emissionTint[0],
        emissionTint[1],
        emissionTint[2],
      );
      material.emissiveIntensity = Math.max(
        0,
        scalar(effect, ["g_flSelfIllumScale1", "g_flSelfIllumScale"], 1),
      );
    }
    const additive =
      effect.flags.F_ADDITIVE_BLEND === 1 ||
      effect.flags.F_ADDITIVE === 1 ||
      family === "sparkle";
    if (additive) material.blending = THREE.AdditiveBlending;
    if (
      additive ||
      family === "smoke" ||
      family === "spectral" ||
      family === "slime"
    ) {
      material.transparent = true;
      material.depthWrite = false;
    }
    const time = { value: 0 };
    clocks.push(time);
    const uniforms = {
      uSourceTime: time,
      uSourceScroll: { value: new THREE.Vector2(scroll[0], scroll[1]) },
      uSourceScale: { value: new THREE.Vector2(scale[0], scale[1]) },
      uSourceOffset: { value: new THREE.Vector2(offset[0], offset[1]) },
      uSourceRotation: {
        value: (rotation * Math.PI) / 180,
      },
      uSourceEmissionScroll: {
        value: new THREE.Vector2(emissionScroll[0], emissionScroll[1]),
      },
      // The exporter changes axes while retaining the model's Source units.
      uSourceJitter: {
        value: new THREE.Matrix3().set(
          jitter[0],
          jitter[1],
          jitter[2],
          jitterZ[0],
          jitterZ[1],
          jitterZ[2],
          -jitterY[0],
          -jitterY[1],
          -jitterY[2],
        ),
      },
      uSourceJitterB: {
        value: new THREE.Matrix3().set(
          jitterB[0],
          jitterB[1],
          jitterB[2],
          jitterZB[0],
          jitterZB[1],
          jitterZB[2],
          -jitterYB[0],
          -jitterYB[1],
          -jitterYB[2],
        ),
      },
      uSourceJitterFrequency: {
        value: new THREE.Vector3(
          jitterFrequency[0],
          jitterFrequency[1],
          jitterFrequency[2],
        ),
      },
      uSourceJitterFrequencyB: {
        value: new THREE.Vector3(
          jitterFrequencyB[0],
          jitterFrequencyB[1],
          jitterFrequencyB[2],
        ),
      },
      uSourceJitterSpeedB: {
        value: scalar(effect, ["g_flJitterSpeedB1", "g_flJitterSpeedB"], 0),
      },
      uSourceJitterSpeed: {
        value: scalar(effect, ["g_flJitterSpeedA1", "g_flJitterSpeedA"], 1),
      },
      uSourceJitterQuantize: {
        value: Math.max(
          0,
          scalar(
            effect,
            ["g_flJitterQuantizeTime1", "g_flJitterQuantizeTime"],
            0,
          ),
        ),
      },
      uSourceJitterQuantizeDisplacement: {
        value: Math.max(
          0,
          scalar(
            effect,
            [
              "g_flJitterQuantizeDisplacement1",
              "g_flJitterQuantizeDisplacement",
            ],
            0,
          ),
        ),
      },
      uSourceOpacity: {
        value: THREE.MathUtils.clamp(opacity, 0, 1),
      },
      uSourceRim: {
        value: scalar(
          effect,
          ["g_flFresnelExponent1", "g_flFresnelExponent"],
          family === "slime" || family === "spectral" ? 3 : 0,
        ),
      },
      uSourceWipe: {
        value:
          family === "sparkle"
            ? scalar(effect, ["g_flAnimationRate", "g_flSparkleSpeed"], 1)
            : 0,
      },
      uSourceMask: { value: mask },
      uSourceHasMask: { value: mask ? 1 : 0 },
      uSourceMaskIsAlpha: {
        value: Object.keys(effect.textures).some((name) =>
          /jittermask/i.test(name),
        )
          ? 0
          : 1,
      },
      uSourceEmission: {
        value: new THREE.Vector3(
          emissionTint[0],
          emissionTint[1],
          emissionTint[2],
        ).multiplyScalar(emissionStrength),
      },
      uSourceEmissionAlbedo: {
        value: THREE.MathUtils.clamp(
          scalar(
            effect,
            ["g_flSelfIllumAlbedoFactor1", "g_flSelfIllumAlbedoFactor"],
            1,
          ),
          0,
          1,
        ),
      },
      uSourceEmissionScale: {
        value: new THREE.Vector2(emissionScale[0], emissionScale[1]),
      },
      uSourceEmissionOffset: {
        value: new THREE.Vector2(emissionOffset[0], emissionOffset[1]),
      },
      uSourceEmissionRotation: {
        value:
          (scalar(
            effect,
            ["g_flSelfIllumTexcoordRotation1", "g_flSelfIllumTexcoordRotation"],
            0,
          ) *
            Math.PI) /
          180,
      },
    };
    const removeHook = addMaterialShaderHook(
      material,
      `source2-effect-v1:${family}:${hasJitter ? "jitter" : "static"}`,
      (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
          .replace(
            "void main() {",
            `${hasJitter ? "#define SOURCE2_JITTER\n" : ""}${COMMON}\nvoid main() {`,
          )
          .replace(
            "#include <uv_vertex>",
            `#include <uv_vertex>\nvSourceUv = uv;`,
          )
          .replace(
            "#include <begin_vertex>",
            `#include <begin_vertex>
        #ifdef SOURCE2_JITTER
        float sourceT = uSourceJitterQuantize > 0.0 ? floor(uSourceTime / uSourceJitterQuantize) * uSourceJitterQuantize : uSourceTime;
        vec3 sourcePosition = vec3(position.x, -position.z, position.y);
        vec3 sourceDisplacement = uSourceJitter * sin(sourceT * uSourceJitterSpeed + sourcePosition * uSourceJitterFrequency);
        sourceDisplacement += uSourceJitterB * sin(sourceT * uSourceJitterSpeedB + sourcePosition * uSourceJitterFrequencyB);
        if (uSourceJitterQuantizeDisplacement > 0.0) sourceDisplacement = floor(sourceDisplacement / uSourceJitterQuantizeDisplacement) * uSourceJitterQuantizeDisplacement;
        if (uSourceHasMask > 0.5 && uSourceMaskIsAlpha < 0.5) sourceDisplacement *= texture2D(uSourceMask, vSourceUv).r;
        transformed += sourceDisplacement;
        #endif
        #ifdef USE_MAP
          vMapUv = sourceTransform(vMapUv, uSourceScroll);
        #endif
        #ifdef USE_EMISSIVEMAP
          vEmissiveMapUv = sourceEmissionTransform(vEmissiveMapUv);
        #endif`,
          );
        shader.fragmentShader = shader.fragmentShader
          .replace("void main() {", `${COMMON}\nvoid main() {`)
          .replace(
            "#include <alphamap_fragment>",
            `#include <alphamap_fragment>
        diffuseColor.a *= uSourceOpacity;
        if (uSourceHasMask > 0.5 && uSourceMaskIsAlpha > 0.5) diffuseColor.a *= texture2D(uSourceMask, sourceTransform(vSourceUv, uSourceScroll)).r;
        if (uSourceWipe > 0.0) {
          float phase = fract(uSourceTime * uSourceWipe + dot(floor(vSourceUv * 13.0), vec2(0.137, 0.317)));
          diffuseColor.a *= smoothstep(0.0, 0.15, phase) * (1.0 - smoothstep(0.4, 0.8, phase));
        }`,
          )
          .replace(
            "#include <emissivemap_fragment>",
            `#include <emissivemap_fragment>
        totalEmissiveRadiance += mix(vec3(1.0), diffuseColor.rgb, uSourceEmissionAlbedo) * uSourceEmission;
        if (uSourceRim > 0.0) totalEmissiveRadiance += diffuseColor.rgb * pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), uSourceRim);`,
          );
      },
    );
    cleanups.push(() => {
      removeHook();
      material.blending = old.blending;
      material.transparent = old.transparent;
      material.depthWrite = old.depthWrite;
      material.emissive.copy(old.emissive);
      material.emissiveIntensity = old.emissiveIntensity;
    });
  }
  return {
    diagnostics,
    update(timeSeconds) {
      const time = Number.isFinite(timeSeconds) ? Math.max(0, timeSeconds) : 0;
      for (const clock of clocks) clock.value = time;
    },
    dispose() {
      let cleanup = cleanups.pop();
      while (cleanup) {
        cleanup();
        cleanup = cleanups.pop();
      }
      const closedImages = new Set<ImageBitmap>();
      for (const [original, clone] of maskClones) {
        clone.dispose();
        if (!borrowedTextures.has(original)) original.dispose();
        const image = clone.source.data;
        if (
          typeof ImageBitmap !== "undefined" &&
          image instanceof ImageBitmap &&
          !borrowedImages.has(image) &&
          !closedImages.has(image)
        ) {
          image.close();
          closedImages.add(image);
        }
      }
      maskClones.clear();
      maskRequests.clear();
      clocks.length = 0;
    },
  };
}
