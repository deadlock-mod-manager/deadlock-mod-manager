import { z } from "zod";
import * as THREE from "three";
import type { ModdingModelPartEdit } from "@/types/generated/ModdingModelPartEdit";
import { installMaterialStylePreview } from "./model-material-style-preview";
import type { MaterialExpressionInputs } from "./model-material-expression";
import {
  hueOf,
  PAINT_SHADER_SOURCE,
  PAINTED_MAP_FRAGMENT,
} from "./workbench-paint-shader";

import {
  modelPaintFrameAt,
  type ModelPaintAnimation,
} from "@/lib/model-paint-animation";

const source = PAINT_SHADER_SOURCE.replaceAll(
  "uPaint",
  "uModelPaint",
).replaceAll("foundry", "modelEdit");
const paintable = (material: THREE.Material) =>
  material instanceof THREE.MeshStandardMaterial ||
  material instanceof THREE.MeshBasicMaterial;

export function installModelMaterialEdits(root: THREE.Object3D) {
  const updates: ((
    edits: readonly ModdingModelPartEdit[],
    patterns: ReadonlyMap<string, Uint8Array>,
    paints: ReadonlyMap<string, Uint8Array>,
    animations: ReadonlyMap<string, ModelPaintAnimation>,
  ) => void)[] = [];
  const ticks: ((input: MaterialExpressionInputs) => boolean)[] = [];
  const disposers: (() => void)[] = [];
  const seen = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      if (seen.has(material) || !paintable(material)) continue;
      seen.add(material);
      const parsed = z
        .string()
        .min(1)
        .safeParse(material.userData.sourceMaterial);
      if (!parsed.success) continue;
      const identity = parsed.data;
      const style = installMaterialStylePreview(material);
      let patternBytes: Uint8Array | undefined;
      let patternTexture = new THREE.DataTexture(
        new Uint8Array([255, 255, 255, 255]),
        1,
        1,
      );
      patternTexture.needsUpdate = true;
      let paintBytes: Uint8Array | undefined;
      let paintAnimation: ModelPaintAnimation | undefined;
      let paintFrame = -1;
      let paintTexture = new THREE.DataTexture(
        new Uint8Array([255, 255, 255, 255]),
        1,
        1,
      );
      paintTexture.needsUpdate = true;
      const uniforms = {
        uModelAlbedoPaint: { value: paintTexture },
        uModelAlbedoPaintActive: { value: 0 },
        uModelPattern: { value: patternTexture },
        uModelPatternIntensity: { value: 0 },
        uModelTime: { value: 0 },
        uModelScroll: { value: new THREE.Vector2() },
        uModelPaintActive: { value: 0 },
        uModelPaintHue: { value: 0 },
        uModelPaintSaturation: { value: 1 },
        uModelPaintBrightness: { value: 1 },
        uModelTint: { value: new THREE.Color(1, 1, 1) },
      };
      const previous = material.onBeforeCompile;
      const key = material.customProgramCacheKey();
      material.onBeforeCompile = (shader, renderer) => {
        previous.call(material, shader, renderer);
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = `uniform float uModelTime;\nuniform vec2 uModelScroll;\n${shader.vertexShader}`;
        shader.vertexShader = shader.vertexShader.replace(
          "#include <uv_vertex>",
          `#include <uv_vertex>
#ifdef USE_MAP
vMapUv+=uModelScroll*uModelTime;
#endif`,
        );
        const mapFragment = shader.fragmentShader.includes(PAINTED_MAP_FRAGMENT)
          ? PAINTED_MAP_FRAGMENT
          : "#include <map_fragment>";
        shader.fragmentShader = shader.fragmentShader
          .replace(
            "void main() {",
            `${source}
uniform vec3 uModelTint;
uniform sampler2D uModelPattern;
uniform float uModelPatternIntensity;
uniform sampler2D uModelAlbedoPaint;
uniform float uModelAlbedoPaintActive;
void main() {`,
          )
          .replace(
            mapFragment,
            `vec3 modelPaintBase = diffuseColor.rgb;
${mapFragment}
#ifdef USE_MAP
if(uModelAlbedoPaintActive>0.5) diffuseColor.rgb = modelPaintBase * texture2D(uModelAlbedoPaint,vMapUv).rgb;
#endif
#ifdef USE_MAP
if(uModelPatternIntensity>0.0) {
 vec3 patternColor=texture2D(uModelPattern,vMapUv).rgb;
 vec3 originalColor=sRGBTransferOETF(vec4(diffuseColor.rgb,1.0)).rgb;
 float brightness=max(originalColor.r,max(originalColor.g,originalColor.b));
 float peak=max(0.0039215686,max(patternColor.r,max(patternColor.g,patternColor.b)));
 vec3 painted=mix(originalColor,patternColor*(brightness/peak),uModelPatternIntensity);
 diffuseColor.rgb=sRGBTransferEOTF(vec4(painted,1.0)).rgb;
}
#endif
if (uModelPaintActive > 0.5) diffuseColor.rgb = modelEditToLinear(modelEditPaint(modelEditToSrgb(clamp(diffuseColor.rgb, 0.0, 1.0))));
diffuseColor.rgb *= uModelTint;`,
          );
      };
      disposers.push(() => patternTexture.dispose());
      disposers.push(() => paintTexture.dispose());
      ticks.push((input) => {
        uniforms.uModelTime.value = input.time;
        if (paintAnimation && paintAnimation.frames.length > 1) {
          const index = modelPaintFrameAt(paintAnimation, input.time);
          const frame = paintAnimation.frames[index];
          if (frame && index !== paintFrame) {
            paintFrame = index;
            paintTexture.image.data = frame.pixels;
            paintTexture.needsUpdate = true;
          }
        }
        const motion = style.tick(input);
        uniforms.uModelScroll.value.set(
          motion.scroll[0] ?? 0,
          motion.scroll[1] ?? 0,
        );
        return motion.active || (paintAnimation?.frames.length ?? 0) > 1;
      });
      material.customProgramCacheKey = () => `${key}:model-edit-v2`;
      material.needsUpdate = true;
      const visible = material.visible;
      const finish =
        material instanceof THREE.MeshStandardMaterial
          ? {
              roughness: material.roughness,
              metalness: material.metalness,
              roughnessMap: material.roughnessMap,
              metalnessMap: material.metalnessMap,
            }
          : null;
      updates.push((edits, patterns, paints, animations) => {
        const edit = edits.find((candidate) => candidate.material === identity);
        style.set(edit);
        const animation = animations.get(identity);
        if (animation !== paintAnimation) {
          paintAnimation = animation;
          paintFrame = -1;
        }
        const painted = paints.get(identity);
        if (painted && painted !== paintBytes) {
          paintBytes = painted;
          const texture = new THREE.DataTexture(
            painted,
            paintAnimation?.width ?? 256,
            paintAnimation?.height ?? 256,
          );
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          texture.minFilter = texture.magFilter = THREE.LinearFilter;
          texture.flipY = false;
          texture.needsUpdate = true;
          uniforms.uModelAlbedoPaint.value = texture;
          paintTexture.dispose();
          paintTexture = texture;
        }
        uniforms.uModelAlbedoPaintActive.value = edit?.paint && painted ? 1 : 0;
        const next = patterns.get(identity);
        if (next && next !== patternBytes) {
          patternBytes = next;
          const texture = new THREE.DataTexture(next, 128, 128);
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          texture.magFilter = THREE.LinearFilter;
          texture.minFilter = THREE.LinearFilter;
          texture.flipY = false;
          texture.needsUpdate = true;
          uniforms.uModelPattern.value = texture;
          patternTexture.dispose();
          patternTexture = texture;
        }
        uniforms.uModelPatternIntensity.value =
          edit?.pattern && patternBytes ? edit.pattern.intensity : 0;
        material.visible = visible && !edit?.hidden;
        uniforms.uModelTint.value.set(edit?.tint ?? "#ffffff");
        uniforms.uModelPaintActive.value = edit?.recolor ? 1 : 0;
        if (edit?.recolor) {
          uniforms.uModelPaintHue.value = hueOf(edit.recolor.color);
          uniforms.uModelPaintSaturation.value = edit.recolor.saturation;
          uniforms.uModelPaintBrightness.value = edit.recolor.brightness;
        }
        if (finish && material instanceof THREE.MeshStandardMaterial) {
          const roughnessMap =
            edit?.roughness != null ? null : finish.roughnessMap;
          const metalnessMap =
            edit?.metalness != null ? null : finish.metalnessMap;
          if (
            material.roughnessMap !== roughnessMap ||
            material.metalnessMap !== metalnessMap
          )
            material.needsUpdate = true;
          material.roughness = edit?.roughness ?? finish.roughness;
          material.metalness = edit?.metalness ?? finish.metalness;
          material.roughnessMap = roughnessMap;
          material.metalnessMap = metalnessMap;
        }
      });
    }
  });
  const apply = (
    edits: readonly ModdingModelPartEdit[],
    patterns: ReadonlyMap<string, Uint8Array> = new Map(),
    paints: ReadonlyMap<string, Uint8Array> = new Map(),
    animations: ReadonlyMap<string, ModelPaintAnimation> = new Map(),
  ) => {
    for (const update of updates) update(edits, patterns, paints, animations);
    root.traverse((object) => {
      if (
        object instanceof THREE.Mesh &&
        object.userData.previewOutline === true &&
        object.parent instanceof THREE.Mesh &&
        !Array.isArray(object.material) &&
        !Array.isArray(object.parent.material)
      )
        object.material.visible = object.parent.material.visible;
    });
  };
  return Object.assign(apply, {
    tick: (input: MaterialExpressionInputs) => {
      let active = false;
      for (const tick of ticks) active = tick(input) || active;
      return active;
    },
    dispose: () => {
      for (const dispose of disposers) dispose();
    },
  });
}
