import * as THREE from "three";
import { createPreviewClip } from "@/lib/preview-animation";
import type { PreviewAnimation } from "@/types/generated/PreviewAnimation";

/** The stock clip follows the selected clip's normalized phase, even if its length differs. */
export const createComparisonPlayback = (root: THREE.Object3D) => {
  let mixer: THREE.AnimationMixer | null = null;
  let phaseScale = 1;
  const clear = () => {
    mixer?.stopAllAction();
    mixer?.uncacheRoot(root);
    mixer = null;
  };
  return {
    reset: () => mixer?.setTime(0),
    update: (delta: number) => mixer?.update(delta),
    get phaseScale() {
      return phaseScale;
    },
    setAnimation(
      animation: PreviewAnimation | null,
      time: number,
      primaryDuration: number,
    ) {
      clear();
      if (!animation) {
        phaseScale = 1;
        return;
      }
      phaseScale =
        primaryDuration > 0 ? animation.duration / primaryDuration : 1;
      mixer = new THREE.AnimationMixer(root);
      mixer.timeScale = phaseScale;
      mixer.clipAction(createPreviewClip(root, animation)).play();
      mixer.setTime(time);
    },
    dispose: clear,
  };
};
