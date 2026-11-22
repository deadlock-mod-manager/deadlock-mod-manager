import * as THREE from "three";
import type { AnimatedMaterials } from "@/lib/animated-materials";
import type { PreviewAnimation } from "@/types/generated/PreviewAnimation";
import type {
  ViewerEffect,
  ViewerEffectContext,
  ViewerEffectFactory,
} from "./viewer-effects";
import { attachNprOutlines } from "./npr-outline";
import type { ViewerLook } from "./viewer-tools";
import { createComparisonPlayback } from "./comparison-playback";

/** Both results live in one scene and advance on the same fixed-step clock. */
export const createViewerComparison = (
  context: ViewerEffectContext,
  materials: AnimatedMaterials,
) => {
  const playback = createComparisonPlayback(context.model);
  let effects: ViewerEffect[] = [];
  let visible = false;
  const outlines = attachNprOutlines(context.model);
  const effectScene = new THREE.Scene();
  context.scene.add(effectScene);
  effectScene.visible = false;
  const reset = () => {
    playback.reset();
    for (const effect of effects) effect.reset();
  };
  const update = (delta: number) => {
    playback.update(delta);
    for (const effect of effects) effect.update(delta * playback.phaseScale);
    outlines.setViewportHeight(
      Math.max(context.renderer.domElement.clientHeight, 1),
    );
  };
  return {
    reset,
    update,
    prepare(time: number) {
      materials.update(time);
      for (const effect of effects) effect.prepare?.();
    },
    setLook(look: ViewerLook) {
      outlines.setVisible(look.outlines);
      context.model.traverse((child) => {
        if (
          child instanceof THREE.Mesh &&
          child.material instanceof THREE.MeshStandardMaterial
        )
          child.material.wireframe = look.wireframe;
      });
    },
    setVisible(value: boolean) {
      visible = value;
      context.model.visible = value;
      effectScene.visible = value;
    },
    setAnimation(
      animation: PreviewAnimation | null,
      time: number,
      primaryDuration: number,
    ) {
      playback.setAnimation(animation, time, primaryDuration);
    },
    setEffects(factories: readonly ViewerEffectFactory[]) {
      for (const effect of effects) effect.dispose();
      effects = factories
        .map((factory) => factory({ ...context, scene: effectScene }))
        .filter((effect): effect is ViewerEffect => effect !== null);
      // Late effects start at the current posed model. Both sides share every
      // subsequent fixed step and seek; loading stock must not rewind the mod.
      context.model.visible = visible;
    },
    dispose() {
      materials.dispose();
      playback.dispose();
      for (const effect of effects) effect.dispose();
      effects = [];
      outlines.dispose();
      context.scene.remove(effectScene);
    },
  };
};
