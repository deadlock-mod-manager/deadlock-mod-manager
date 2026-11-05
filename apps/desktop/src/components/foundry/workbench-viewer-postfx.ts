import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

/** Keep HDR targets and full-screen passes out of viewers that do not use them. */
export const createViewerPostFx = (
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
) => {
  let bloomOn = false;
  let antialiasOn = false;
  let width = 1;
  let height = 1;
  let composer: EffectComposer | null = null;
  let bloom: UnrealBloomPass | null = null;
  let antialias: SMAAPass | null = null;
  let output: OutputPass | null = null;
  let renderPass: RenderPass | null = null;

  const dispose = () => {
    bloom?.dispose();
    antialias?.dispose();
    output?.dispose();
    renderPass?.dispose();
    composer?.dispose();
    composer = null;
    bloom = null;
    antialias = null;
    output = null;
    renderPass = null;
  };
  const releaseIfUnused = () => {
    if (!bloomOn && !antialiasOn) dispose();
  };
  return {
    setSize(cssWidth: number, cssHeight: number) {
      const ratio = renderer.getPixelRatio();
      const nextWidth = Math.max(1, Math.floor(cssWidth * ratio));
      const nextHeight = Math.max(1, Math.floor(cssHeight * ratio));
      if (nextWidth === width && nextHeight === height) return;
      width = nextWidth;
      height = nextHeight;
      composer?.setSize(width, height);
    },
    setAntialias(enabled: boolean) {
      antialiasOn = enabled;
      releaseIfUnused();
    },
    setBloom(enabled: boolean) {
      bloomOn = enabled;
      releaseIfUnused();
    },
    render() {
      if (!bloomOn && !antialiasOn) {
        renderer.render(scene, camera);
        return;
      }
      if (!composer) {
        composer = new EffectComposer(
          renderer,
          new THREE.WebGLRenderTarget(1, 1, {
            type: THREE.HalfFloatType,
            stencilBuffer: true,
          }),
        );
        // Target sizes are physical pixels, so a resize reallocates each target once.
        composer.setPixelRatio(1);
        composer.setSize(width, height);
        renderPass = new RenderPass(scene, camera);
        output = new OutputPass();
        composer.addPass(renderPass);
        composer.addPass(output);
      }
      if (bloomOn && !bloom) {
        bloom = new UnrealBloomPass(
          new THREE.Vector2(width, height),
          0.3,
          0.3,
          1.2,
        );
        composer.insertPass(bloom, 1);
      }
      if (antialiasOn && !antialias) {
        antialias = new SMAAPass();
        composer.addPass(antialias);
      }
      if (bloom) bloom.enabled = bloomOn;
      if (antialias) antialias.enabled = antialiasOn;
      composer.render();
    },
    dispose,
  };
};
