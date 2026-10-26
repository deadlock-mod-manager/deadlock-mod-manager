import { invoke } from "@tauri-apps/api/core";
import {
  AnimationClip,
  Object3D,
  PropertyBinding,
  QuaternionKeyframeTrack,
  VectorKeyframeTrack,
} from "three";
import type { PreviewAbilityParticles } from "@/types/generated/PreviewAbilityParticles";
import type { PreviewAnimation } from "@/types/generated/PreviewAnimation";
import type { PreviewCloth } from "@/types/generated/PreviewCloth";
import type { PreviewParticles } from "@/types/generated/PreviewParticles";
import type { PreviewAnimationChoice } from "@/types/generated/PreviewAnimationChoice";

export interface PreviewSource {
  filePath: string;
  entryPath: string;
}
export interface PreviewPlayback {
  animation: PreviewAnimation | null;
  playing: boolean;
  speed: number;
  seek: { time: number; revision: number };
}

/**
 * The model's playable moves. `abilityNames` (the hero's ability names) find
 * abilities whose clips are not prefixed `ability_`, like Bebop's Hyper Beam.
 */
export const listPreviewAnimations = (
  source: PreviewSource,
  abilityNames: string[],
) =>
  invoke<PreviewAnimationChoice[]>("foundry_list_animations", {
    filePath: source.filePath,
    entryPath: source.entryPath,
    abilityNames,
  });
/** Decodes `clipPaths` back to back into one looping timeline. */
export const decodePreviewAnimation = (
  source: PreviewSource,
  clipPaths: string[],
) =>
  invoke<PreviewAnimation>("foundry_decode_animation", {
    filePath: source.filePath,
    entryPath: source.entryPath,
    clipPaths,
  });

/** The model's cloth setup, or null when nothing on it is simulated. */
export const decodePreviewCloth = (source: PreviewSource) =>
  invoke<PreviewCloth | null>("foundry_decode_cloth", {
    filePath: source.filePath,
    entryPath: source.entryPath,
  });

/** The particle effects the model shows in previews, with their attachments and textures. */
export const decodePreviewParticles = (source: PreviewSource) =>
  invoke<PreviewParticles>("foundry_decode_particles", {
    filePath: source.filePath,
    entryPath: source.entryPath,
  });

/** The particle effects an ability plays on its caster, bound to this model. */
export const decodePreviewAbilityParticles = (
  source: PreviewSource,
  abilityClass: string,
) =>
  invoke<PreviewAbilityParticles>("foundry_decode_ability_particles", {
    filePath: source.filePath,
    entryPath: source.entryPath,
    abilityClass,
  });

export function createPreviewClip(
  root: Object3D,
  animation: PreviewAnimation,
): AnimationClip {
  const tracks = animation.tracks.flatMap((track) => {
    const bone = root.getObjectByName(
      PropertyBinding.sanitizeNodeName(track.name),
    );
    if (!bone) return [];
    return [
      new VectorKeyframeTrack(
        `${bone.uuid}.position`,
        animation.times,
        track.positions,
      ),
      new QuaternionKeyframeTrack(
        `${bone.uuid}.quaternion`,
        animation.times,
        track.rotations,
      ),
      new VectorKeyframeTrack(
        `${bone.uuid}.scale`,
        animation.times,
        track.scales,
      ),
    ];
  });
  return new AnimationClip("preview", animation.duration, tracks);
}
