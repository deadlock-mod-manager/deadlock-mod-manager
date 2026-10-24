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
