import { describe, expect, it } from "bun:test";
import * as THREE from "three";
import type { ControlPoint } from "./values";
import { ModelSurface } from "./model-surface";
import { ParticleAttachments, SOURCE_TO_GLTF } from "./attachments";

describe("particle model anchors", () => {
  it("applies source attachment offsets through the animated GLB bone and display scale", () => {
    const parent = new THREE.Group();
    parent.scale.setScalar(0.002);
    const rig = new THREE.Group();
    rig.rotation.y = -Math.PI / 2;
    const bone = new THREE.Bone();
    bone.name = "hand_R";
    bone.position.set(10, 20, 30);
    rig.add(bone);
    parent.add(rig);
    const attachment = new ParticleAttachments(rig, {
      muzzle: {
        m_nInfluences: 1,
        m_influenceNames: ["hand_R"],
        m_influenceWeights: [1],
        m_vInfluenceOffsets: [[1, 2, 3]],
        m_vInfluenceRotations: [[0, 0, 0, 1]],
      },
    });
    const controls = new Map<number, ControlPoint>();
    attachment.update(controls, [
      { m_iControlPoint: 0, m_attachmentName: "muzzle" },
    ]);
    const point = controls.get(0);
    if (!point) throw Error("Missing attachment point");
    const actual = attachment.root.localToWorld(point.position.clone());
    const expected = bone.localToWorld(
      new THREE.Vector3(1, 2, 3).applyQuaternion(SOURCE_TO_GLTF),
    );
    expect(actual.distanceTo(expected)).toBeLessThan(0.000001);
    bone.position.y += 5;
    attachment.update(controls, [{ m_attachmentName: "muzzle" }]);
    expect(
      attachment.root
        .localToWorld(point.position.clone())
        .distanceTo(
          bone.localToWorld(
            new THREE.Vector3(1, 2, 3).applyQuaternion(SOURCE_TO_GLTF),
          ),
        ),
    ).toBeLessThan(0.000001);
    attachment.dispose();
  });
  it("keeps a sampled surface point bound to the model as it moves", () => {
    const rig = new THREE.Group(),
      frame = new THREE.Group(),
      parent = new THREE.Group();
    parent.add(rig, frame);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
    );
    rig.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));
    parent.updateWorldMatrix(true, true);
    const sampler = new ModelSurface(rig, frame),
      point = sampler.sample(() => 0.5);
    if (!point) throw Error("No surface sample");
    expect(point.position.x).toBeGreaterThan(0);
    expect(point.position.y).toBeGreaterThan(0);
    expect(point.position.x + point.position.y).toBeLessThan(1);
    rig.position.y = 2;
    parent.updateWorldMatrix(true, true);
    expect(point.read().y - point.position.y).toBeCloseTo(2);
    geometry.dispose();
  });
});
