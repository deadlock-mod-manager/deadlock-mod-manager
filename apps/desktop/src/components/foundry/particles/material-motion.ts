import * as THREE from "three";
import type { ViewerEffect } from "../viewer-effects";
import type { ParticleAssets } from "./assets";
import { fields, list, num, str, vec, type Fields } from "./values";

const parameter = (data: Fields, section: string, name: string) =>
  list(data[section])
    .map(fields)
    .find((entry) => str(entry.m_name) === name);

const JITTER_SHADER = `
uniform float dmmMotionTime;
uniform sampler2D dmmJitterMask;
uniform vec3 dmmFrequencyA, dmmFrequencyB;
uniform mat3 dmmAmplitudeA, dmmAmplitudeB;
uniform vec3 dmmExpression;
uniform vec4 dmmJitterTiming;
vec3 dmmJitterWave(vec3 p, vec3 frequency, float speed, float time) {
  vec3 phase = fract(p * abs(frequency)) + sign(frequency) * (time * speed);
  vec3 wave = abs(fract(phase) * 2.0 - 1.0);
  return wave * wave * (3.0 - 2.0 * wave) - 0.5;
}
vec3 dmmJitter(vec3 position) {
  float time = dmmJitterTiming.z == 0.0 ? dmmMotionTime : floor(dmmMotionTime / dmmJitterTiming.z + 0.5) * dmmJitterTiming.z;
  vec3 sourcePosition = vec3(position.x, -position.z, position.y);
  vec3 displacement = dmmAmplitudeA * dmmJitterWave(sourcePosition, dmmFrequencyA, dmmJitterTiming.x, time)
    + dmmAmplitudeB * dmmJitterWave(sourcePosition, dmmFrequencyB, dmmJitterTiming.y, time) + dmmExpression;
  if (dmmJitterTiming.w != 0.0) displacement = floor(displacement / dmmJitterTiming.w + 0.5) * dmmJitterTiming.w;
  displacement *= texture2D(dmmJitterMask, uv).r;
  return vec3(displacement.x, displacement.z, -displacement.y);
}
`;

/** Authored PBR jitter and UV scrolling. Jitter follows VRF's pbr.vert shader;
 * its MIT notice is in LICENSE.source2-viewer. */
export const createMaterialMotion = (
  model: THREE.Object3D,
  assets: ParticleAssets,
): ViewerEffect => {
  let elapsed = 0;
  const time = { value: 0 };
  const restores: (() => void)[] = [];
  const scrolls: {
    texture: THREE.Texture;
    origin: THREE.Vector2;
    speed: THREE.Vector2;
    quantize: number;
  }[] = [];
  const seen = new Set<THREE.Material>();
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      if (
        !(material instanceof THREE.MeshStandardMaterial) ||
        seen.has(material)
      )
        continue;
      seen.add(material);
      const source = str(fields(material.userData).sourceMaterial);
      const data = fields(assets.graph.materials[source]);
      const vector = (name: string, fallback = 0) =>
        vec(parameter(data, "m_vectorParams", name)?.m_value, fallback);
      const scalar = (name: string, fallback = 0) =>
        num(parameter(data, "m_floatParams", name)?.m_flValue, fallback);
      const mode = num(
        parameter(data, "m_intParams", "F_JITTER_VERTICES")?.m_nValue,
      );
      for (const channel of ["map", "normalMap"] satisfies (
        | "map"
        | "normalMap"
      )[]) {
        const name = channel === "map" ? "Albedo" : "NormalAndRoughness";
        const speed = vector(`g_v${name}ScrollSpeed1`);
        const original = material[channel];
        if (original && (speed.x !== 0 || speed.y !== 0)) {
          const texture = original.clone();
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          material[channel] = texture;
          scrolls.push({
            texture,
            origin: texture.offset.clone(),
            speed: new THREE.Vector2(speed.x, speed.y),
            quantize: scalar(`g_fl${name}ScrollQuantize1`),
          });
          restores.push(() => {
            material[channel] = original;
            texture.dispose();
          });
        }
      }
      if (!mode) continue;
      const maskPath = str(
        parameter(data, "m_textureParams", "g_tJitterMask")?.m_pValue,
      );
      const originalMask = assets.textures.get(maskPath)?.texture;
      if (!originalMask) {
        assets.warnings.add(`Jitter mask unavailable: ${maskPath}`);
        continue;
      }
      const mask = originalMask.clone();
      mask.colorSpace = THREE.NoColorSpace;
      const matrix = (suffix: string, defaults: number[][]) => {
        const rows = ["X", "Y", "Z"].map((axis, i) => {
          const value = parameter(
            data,
            "m_vectorParams",
            `g_vJitterAmplitudes${axis}${suffix}1`,
          )?.m_value;
          return value ? vec(value).toArray() : defaults[i];
        });
        const [x, y, z] = rows;
        return new THREE.Matrix3().set(
          x[0],
          x[1],
          x[2],
          y[0],
          y[1],
          y[2],
          z[0],
          z[1],
          z[2],
        );
      };
      const previousCompile = material.onBeforeCompile;
      const previousKey = material.customProgramCacheKey;
      material.onBeforeCompile = (shader, renderer) => {
        previousCompile.call(material, shader, renderer);
        Object.assign(shader.uniforms, {
          dmmMotionTime: time,
          dmmJitterMask: { value: mask },
          dmmFrequencyA: {
            value: parameter(data, "m_vectorParams", "g_vJitterFrequenciesA1")
              ? vector("g_vJitterFrequenciesA1")
              : new THREE.Vector3(0.02, 0.04, 0.08),
          },
          dmmFrequencyB: {
            value: parameter(data, "m_vectorParams", "g_vJitterFrequenciesB1")
              ? vector("g_vJitterFrequenciesB1")
              : new THREE.Vector3(0.05, 0.09, 0.17),
          },
          dmmAmplitudeA: {
            value: matrix("A", [
              [4, 0, 0],
              [0, 4, 0],
              [0, 0, 4],
            ]),
          },
          dmmAmplitudeB: {
            value: matrix("B", [
              [0, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ]),
          },
          dmmExpression: { value: vector("g_vJitterExpression") },
          dmmJitterTiming: {
            value: new THREE.Vector4(
              scalar("g_flJitterSpeedA1", 10),
              scalar("g_flJitterSpeedB1", 7),
              scalar("g_flJitterQuantizeTime1"),
              scalar("g_flJitterQuantizeDisplacement1"),
            ),
          },
        });
        shader.vertexShader = JITTER_SHADER + shader.vertexShader;
        const displacement =
          mode === 2
            ? `
          vec3 dmmDisplacement = dmmJitter(position);
          #ifdef USE_SKINNING
            mat4 dmmSkinMatrix = skinWeight.x * boneMatX + skinWeight.y * boneMatY + skinWeight.z * boneMatZ + skinWeight.w * boneMatW;
            dmmDisplacement = (bindMatrixInverse * dmmSkinMatrix * bindMatrix * vec4(dmmDisplacement, 0.0)).xyz;
          #endif
          transformed += dmmDisplacement;
        `
            : "transformed += dmmJitter(transformed);";
        shader.vertexShader = shader.vertexShader.replace(
          "#include <skinning_vertex>",
          "#include <skinning_vertex>\n" + displacement,
        );
      };
      material.customProgramCacheKey = () =>
        `${previousKey.call(material)}:source-jitter:${mode}`;
      material.needsUpdate = true;
      restores.push(() => {
        material.onBeforeCompile = previousCompile;
        material.customProgramCacheKey = previousKey;
        material.needsUpdate = true;
        mask.dispose();
      });
    }
  });
  const applyTime = () => {
    time.value = elapsed;
    for (const scroll of scrolls) {
      const seconds = scroll.quantize
        ? Math.floor(elapsed / scroll.quantize + 0.5) * scroll.quantize
        : elapsed;
      scroll.texture.offset
        .copy(scroll.origin)
        .addScaledVector(scroll.speed, seconds);
    }
  };
  return {
    reset() {
      elapsed = 0;
      applyTime();
    },
    update(delta) {
      elapsed += Math.max(0, delta);
      applyTime();
    },
    dispose() {
      for (const restore of restores) restore();
    },
  };
};
