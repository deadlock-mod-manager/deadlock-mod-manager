import { describe, expect, it } from "bun:test";
import { AnimationMixer, Bone, Group, PropertyBinding } from "three";
import { createPreviewClip } from "./preview-animation";

describe("local preview animation", () => {
  it("binds sanitized bone names and interpolates position without moving the scene", () => {
    const root = new Group();
    const bone = new Bone();
    bone.name = PropertyBinding.sanitizeNodeName("$cloth:root");
    root.add(bone);
    const clip = createPreviewClip(root, {
      duration: 1,
      segments: [],
      times: [0, 1],
      tracks: [
        {
          name: "$cloth:root",
          positions: [0, 0, 0, 10, 2, 0],
          rotations: [0, 0, 0, 1, 0, 0, 0, 1],
          scales: [1, 1, 1, 1, 1, 1],
        },
      ],
    });
    const mixer = new AnimationMixer(root);
    mixer.clipAction(clip).play();
    mixer.setTime(0.5);
    expect(bone.position.x).toBeCloseTo(5);
    expect(bone.position.y).toBeCloseTo(1);
    expect(root.position.x).toBe(0);
    mixer.stopAllAction();
    expect(bone.position.x).toBe(0);
  });

  it("omits tracks for bones absent from the rendered model", () => {
    const clip = createPreviewClip(new Group(), {
      duration: 1,
      segments: [],
      times: [0],
      tracks: [
        {
          name: "missing",
          positions: [0, 0, 0],
          rotations: [0, 0, 0, 1],
          scales: [1, 1, 1],
        },
      ],
    });
    expect(clip.tracks).toHaveLength(0);
  });
});
