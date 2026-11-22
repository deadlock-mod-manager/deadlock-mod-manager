import type * as THREE from "three";
import type { SceneColorCapture } from "@/lib/particles/scene-color";

export interface ViewerEffectContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  model: THREE.Object3D;
  sceneColor?: SceneColorCapture;
}

export interface ViewerEffect {
  reset(): void;
  update(delta: number): void;
  prepare?(): void;
  release?(): void;
  setVisible?(visible: boolean): void;
  dispose(): void;
}

export type ViewerEffectFactory = (
  context: ViewerEffectContext,
) => ViewerEffect | null;

export const restartEvery =
  (
    factory: ViewerEffectFactory,
    period: number,
    startAt = 0,
    releaseAt?: number,
  ): ViewerEffectFactory =>
  (context) =>
    repeatViewerEffect(factory(context), period, startAt, releaseAt);

export const repeatViewerEffect = (
  effect: ViewerEffect | null,
  period: number,
  startAt = 0,
  releaseAt?: number,
): ViewerEffect | null => {
  if (!effect || !(period > 0)) return effect;
  const start = Math.min(Math.max(startAt, 0), period);
  const release =
    releaseAt === undefined
      ? null
      : Math.min(Math.max(releaseAt, start), period);
  let elapsed = 0;
  let started = start === 0;
  let released = false;
  const boundaries = () => {
    if (!started && elapsed >= start) {
      started = true;
      effect.reset();
    }
    if (started && !released && release !== null && elapsed >= release) {
      released = true;
      effect.release?.();
    }
    effect.setVisible?.(started);
  };
  const restart = () => {
    elapsed = 0;
    started = start === 0;
    released = false;
    effect.reset();
    boundaries();
  };
  boundaries();
  return {
    reset: restart,
    update(delta) {
      if (!Number.isFinite(delta) || delta < 0) return;
      let remaining = delta;
      if (elapsed + remaining >= period) {
        const final = (elapsed + remaining) % period;
        restart();
        remaining = final;
      }
      while (remaining > 0) {
        const boundary = !started
          ? start
          : !released && release !== null
            ? release
            : period;
        const step = Math.min(remaining, Math.max(boundary - elapsed, 0));
        if (step > 0 && started) effect.update(step);
        elapsed += step;
        remaining -= step;
        boundaries();
        if (step === 0 && elapsed >= period) break;
      }
    },
    prepare() {
      if (started) effect.prepare?.();
    },
    release: () => effect.release?.(),
    setVisible: (visible) => effect.setVisible?.(visible && started),
    dispose: () => effect.dispose(),
  };
};
