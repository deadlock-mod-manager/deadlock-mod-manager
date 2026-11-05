import * as THREE from "three";

interface EmissionMetadata {
  maskTexture: number | null;
  albedoFactor: number;
}

const overrides = new WeakMap<
  THREE.Material,
  (value: number | undefined) => void
>();

/** Keep the mask independent of albedo so paint and projected images also update glow. */
export function installSource2Emission(
  material: THREE.Material,
  textures: ReadonlyMap<number, THREE.Texture>,
  metadata: EmissionMetadata | null | undefined,
) {
  if (overrides.has(material)) return true;
  if (
    !(material instanceof THREE.MeshStandardMaterial) ||
    !metadata ||
    metadata.maskTexture === null
  )
    return false;
  const mask = textures.get(metadata.maskTexture);
  if (!mask || !material.emissiveMap) return false;
  const factor = { value: metadata.albedoFactor };
  overrides.set(material, (value) => {
    factor.value = value ?? metadata.albedoFactor;
  });
  const before = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    shader.uniforms.uSource2EmissionMask = { value: mask };
    shader.uniforms.uSource2EmissionAlbedo = factor;
    shader.fragmentShader = `uniform sampler2D uSource2EmissionMask;
uniform float uSource2EmissionAlbedo;
${shader.fragmentShader}`.replace(
      "#include <emissivemap_fragment>",
      `#ifdef USE_EMISSIVEMAP
totalEmissiveRadiance *= texture2D(uSource2EmissionMask, vEmissiveMapUv).r
  * mix(vec3(1.0), diffuseColor.rgb, uSource2EmissionAlbedo);
#endif`,
    );
  };
  material.customProgramCacheKey = () => `${key}:source2-emission-v1`;
  material.needsUpdate = true;
  return true;
}

export function updateSource2Emission(
  material: THREE.Material,
  values: ReadonlyMap<string, readonly number[]>,
) {
  overrides.get(material)?.(values.get("g_flSelfIllumAlbedoFactor1")?.[0]);
}
