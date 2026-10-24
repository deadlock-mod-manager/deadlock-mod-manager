import { invoke } from "@tauri-apps/api/core";
import {
  AnimationClip,
  Object3D,
  PropertyBinding,
  QuaternionKeyframeTrack,
  VectorKeyframeTrack,
} from "three";
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

export const listPreviewAnimations = (source: PreviewSource) =>
  invoke<PreviewAnimationChoice[]>("foundry_list_animations", {
    filePath: source.filePath,
    entryPath: source.entryPath,
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
