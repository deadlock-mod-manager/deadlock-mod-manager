import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

/**
 * Renders the scene in HDR and blooms only what is brighter than white, which
 * in practice is self-illuminated material (its glTF emissive strength runs
 * well past 1) and particles. Tone mapping then happens once, in the output pass.
 */
export const createViewerPostFx = (
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
) => {
  const composer = new EffectComposer(
    renderer,
    new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      stencilBuffer: true,
    }),
  );
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.3, 0.3, 1.2);
  composer.addPass(bloom);
  const output = new OutputPass();
  composer.addPass(output);
  const antialias = new SMAAPass();
  composer.addPass(antialias);

  return {
    setSize(width: number, height: number) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(width, height);
    },
    setAntialias(enabled: boolean) {
      antialias.enabled = enabled;
    },
    setBloom(enabled: boolean) {
      bloom.enabled = enabled;
    },
    render() {
      composer.render();
    },
    dispose() {
      bloom.dispose();
      antialias.dispose();
      output.dispose();
      composer.dispose();
    },
  };
};
