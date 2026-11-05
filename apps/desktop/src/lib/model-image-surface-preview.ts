import * as THREE from "three";
import { z } from "zod";
import {
  imageCropBounds,
  type ModelImageAlignment,
} from "./model-image-placement";
import type { ModelImageProjectionFrame } from "./model-image-projection";
import { modelPaintFrameAt } from "./model-paint-animation";

export interface ModelImageSurfaceDraft {
  material: string;
  frames: readonly ModelImageProjectionFrame[];
  plays: number;
  alignment: ModelImageAlignment;
}

const declarations = `
uniform sampler2D uImageDraftTexture;
uniform float uImageDraftActive;
uniform vec2 uImageDraftViewport;
uniform vec2 uImageDraftCenter;
uniform vec2 uImageDraftSize;
uniform vec2 uImageDraftRotation;
uniform vec4 uImageDraftCrop;
`;
const projection = `
if (uImageDraftActive > 0.5 && gl_FrontFacing) {
  vec2 imagePoint = vec2(gl_FragCoord.x, uImageDraftViewport.y - gl_FragCoord.y)
    - uImageDraftCenter * uImageDraftViewport;
  vec2 imageUv = vec2(
    dot(imagePoint, uImageDraftRotation),
    dot(imagePoint, vec2(-uImageDraftRotation.y, uImageDraftRotation.x))
  ) / uImageDraftSize + 0.5;
  if (all(greaterThanEqual(imageUv, uImageDraftCrop.xy)) &&
      all(lessThan(imageUv, uImageDraftCrop.zw))) {
    vec4 imagePixel = texture2D(uImageDraftTexture, imageUv);
    vec3 imageBase = sRGBTransferOETF(vec4(diffuseColor.rgb, 1.0)).rgb;
    diffuseColor.rgb = sRGBTransferEOTF(vec4(mix(imageBase, imagePixel.rgb, imagePixel.a), 1.0)).rgb;
  }
}
`;

/** A small reusable upload buffer keeps animated drafts independent of bake resolution. */
export function writeImagePreviewFrame(
  frame: ModelImageProjectionFrame,
  output?: Uint8Array,
) {
  const scale = Math.min(1, 512 / Math.max(frame.width, frame.height));
  const width = Math.max(1, Math.round(frame.width * scale));
  const height = Math.max(1, Math.round(frame.height * scale));
  const pixels =
    output?.length === width * height * 4
      ? output
      : new Uint8Array(width * height * 4);
  if (width === frame.width && height === frame.height) pixels.set(frame.rgba);
  else
    for (let y = 0; y < height; y++) {
      const sourceY = Math.min(
        frame.height - 1,
        Math.floor(((y + 0.5) * frame.height) / height),
      );
      for (let x = 0; x < width; x++) {
        const sourceX = Math.min(
          frame.width - 1,
          Math.floor(((x + 0.5) * frame.width) / width),
        );
        const source = (sourceY * frame.width + sourceX) * 4;
        const target = (y * width + x) * 4;
        pixels[target] = frame.rgba[source];
        pixels[target + 1] = frame.rgba[source + 1];
        pixels[target + 2] = frame.rgba[source + 2];
        pixels[target + 3] = frame.rgba[source + 3];
      }
    }
  return { data: pixels, width, height };
}

/** Visible fragments already have the projector camera's depth and posed geometry. */
export function installModelImageSurfacePreview(root: THREE.Object3D) {
  const texture = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  texture.flipY = false;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  const common = {
    uImageDraftTexture: { value: texture },
    uImageDraftViewport: { value: new THREE.Vector2(1, 1) },
    uImageDraftCenter: { value: new THREE.Vector2() },
    uImageDraftSize: { value: new THREE.Vector2(1, 1) },
    uImageDraftRotation: { value: new THREE.Vector2(1, 0) },
    uImageDraftCrop: { value: new THREE.Vector4(0, 0, 1, 1) },
  };
  const targets = new Map<
    THREE.Material,
    { identity: string; active: { value: number } }
  >();
  const dispose: (() => void)[] = [];
  root.traverse((object) => {
    if (
      !(object instanceof THREE.Mesh) ||
      object.userData.previewOutline === true
    )
      return;
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      if (
        targets.has(material) ||
        !(
          material instanceof THREE.MeshStandardMaterial ||
          material instanceof THREE.MeshBasicMaterial
        )
      )
        continue;
      const parsed = z
        .string()
        .min(1)
        .safeParse(material.userData.sourceMaterial);
      if (!parsed.success) continue;
      const identity = parsed.data;
      const active = { value: 0 };
      targets.set(material, { identity, active });
      const before = material.onBeforeCompile;
      const programKey = material.customProgramCacheKey;
      const key = programKey.call(material);
      material.onBeforeCompile = (shader, renderer) => {
        before.call(material, shader, renderer);
        Object.assign(shader.uniforms, common, { uImageDraftActive: active });
        shader.fragmentShader =
          declarations +
          shader.fragmentShader.replace(
            "#include <alphamap_fragment>",
            `${projection}\n#include <alphamap_fragment>`,
          );
      };
      material.customProgramCacheKey = () => `${key}:image-surface-v1`;
      material.needsUpdate = true;
      dispose.push(() => {
        material.onBeforeCompile = before;
        material.customProgramCacheKey = programKey;
        material.needsUpdate = true;
      });
    }
  });
  let previous: ModelImageSurfaceDraft | null = null;
  let frames: readonly ModelImageProjectionFrame[] | null = null;
  let frameIndex = -1;
  let started = 0;
  let upload: Uint8Array | undefined;
  return {
    update(
      draft: ModelImageSurfaceDraft | null,
      now: number,
      viewport: { x: number; y: number },
    ) {
      const first = draft?.frames[0];
      if (!draft || !first) {
        if (!previous) return false;
        previous = null;
        frames = null;
        frameIndex = -1;
        for (const target of targets.values()) target.active.value = 0;
        return true;
      }
      let changed =
        draft !== previous ||
        common.uImageDraftViewport.value.x !== viewport.x ||
        common.uImageDraftViewport.value.y !== viewport.y;
      if (draft.frames !== frames) {
        frames = draft.frames;
        frameIndex = -1;
        started = now;
      }
      if (changed) {
        const { alignment } = draft;
        const crop = imageCropBounds(first, alignment.crop);
        common.uImageDraftViewport.value.set(viewport.x, viewport.y);
        common.uImageDraftCenter.value.set(...alignment.center);
        const width = viewport.x * alignment.scale;
        common.uImageDraftSize.value.set(
          width,
          (width * first.height) / first.width,
        );
        common.uImageDraftRotation.value.set(
          Math.cos(alignment.rotation),
          Math.sin(alignment.rotation),
        );
        common.uImageDraftCrop.value.set(
          crop.x / first.width,
          crop.y / first.height,
          (crop.x + crop.width) / first.width,
          (crop.y + crop.height) / first.height,
        );
        for (const target of targets.values())
          target.active.value = target.identity === draft.material ? 1 : 0;
      }
      const index = modelPaintFrameAt(draft, (now - started) / 1000);
      const frame = draft.frames[index];
      if (frame && frameIndex !== index) {
        const pixels = writeImagePreviewFrame(frame, upload);
        upload = pixels.data;
        // WebGL2 texture storage cannot be resized with a sub-image upload.
        if (
          texture.image.width !== pixels.width ||
          texture.image.height !== pixels.height
        )
          texture.dispose();
        texture.image = pixels;
        texture.needsUpdate = true;
        frameIndex = index;
        changed = true;
      }
      previous = draft;
      return changed;
    },
    dispose() {
      for (const release of dispose) release();
      texture.dispose();
    },
  };
}
