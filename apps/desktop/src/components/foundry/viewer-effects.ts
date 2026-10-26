import type * as THREE from "three";

/** What a viewer effect can reach once the model is in the scene. */
export interface ViewerEffectContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  /** The loaded glTF scene root, already framed and centered. */
  model: THREE.Object3D;
}

/**
 * A simulation layered on the model (cloth, particles). `update` runs every
 * visible frame after the animation mixer has posed the skeleton and before
 * the frame is drawn.
 */
export interface ViewerEffect {
  reset(): void;
  update(delta: number): void;
  dispose(): void;
}

export type ViewerEffectFactory = (
  context: ViewerEffectContext,
) => ViewerEffect | null;

/**
 * Restarts the effect every `period` seconds of simulated time, so an effect
 * tied to a looping animation (an ability's cast burst) plays on every loop.
 * With `startAt`, each loop holds the effect back until that many seconds in,
 * like a beam waiting for its firing clip.
 */
export const restartEvery =
  (
    factory: ViewerEffectFactory,
    period: number,
    startAt = 0,
  ): ViewerEffectFactory =>
  (context) => {
    const effect = factory(context);
    if (!effect || !(period > 0)) return effect;
    let elapsed = 0;
    let started = startAt <= 0;
    const restart = () => {
      started = startAt <= 0;
      effect.reset();
    };
    return {
      reset() {
        elapsed = 0;
        restart();
      },
      update(delta) {
        elapsed += delta;
        if (elapsed >= period) {
          elapsed %= period;
          restart();
        }
        if (!started && elapsed >= startAt) {
          started = true;
          effect.reset();
        }
        effect.update(started ? delta : 0);
      },
      dispose: () => effect.dispose(),
    };
  };
