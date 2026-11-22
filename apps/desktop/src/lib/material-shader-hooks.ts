import type * as THREE from "three";

export type MaterialShader = Parameters<THREE.Material["onBeforeCompile"]>[0];

/** Compose preview features without replacing paint/highlight shader hooks. */
export function addMaterialShaderHook(
  material: THREE.Material,
  key: string,
  apply: (shader: MaterialShader) => void,
): () => void {
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  let active = true;
  const hook: THREE.Material["onBeforeCompile"] = function (
    this: THREE.Material,
    shader,
    renderer,
  ) {
    previous.call(this, shader, renderer);
    if (active) apply(shader);
  };
  const combinedKey = () =>
    `${previousKey.call(material)}|${key}:${active ? "active" : "disposed"}`;
  material.onBeforeCompile = hook;
  material.customProgramCacheKey = combinedKey;
  material.needsUpdate = true;
  return () => {
    active = false;
    if (material.onBeforeCompile === hook) material.onBeforeCompile = previous;
    if (material.customProgramCacheKey === combinedKey) {
      material.customProgramCacheKey = previousKey;
    }
    material.needsUpdate = true;
  };
}
