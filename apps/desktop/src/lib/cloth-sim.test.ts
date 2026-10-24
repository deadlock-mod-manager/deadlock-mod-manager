import { expect, test } from "bun:test";
import * as THREE from "three";
import type { PreviewClothNode } from "@/types/generated/PreviewClothNode";
import type { PreviewClothNodeBase } from "@/types/generated/PreviewClothNodeBase";
import type { PreviewCloth } from "@/types/generated/PreviewCloth";
import { createClothEffect } from "./cloth-sim";

const STEP = 1 / 60;
const BASE: PreviewClothNodeBase = {
  node: 1,
  x0: 3,
  x1: 1,
  y0: 2,
  y1: 1,
  qAdjust: [0, 0, Math.SQRT1_2, Math.SQRT1_2],
};

function clothNode(
  name: string,
  parent: number,
  bindPosition: [number, number, number],
  isStatic = false,
): PreviewClothNode {
  return {
    name,
    parent,
    isStatic,
    bindPosition,
    bindRotation: [0, 0, 0, 1],
    gravity: 0,
    damping: 0,
    animationForceAttraction: 0,
    animationVertexAttraction: 0,
    collisionRadius: 0,
  };
}

function fixture(nodeBases: PreviewClothNodeBase[] = []) {
  const model = new THREE.Group();
  const anchor = new THREE.Bone();
  anchor.name = "anchor";
  const bone = new THREE.Bone();
  bone.name = "cloth";
  bone.quaternion.setFromEuler(new THREE.Euler(0.2, 0.7, -0.3));
  anchor.add(bone);
  model.add(anchor);
  const cloth: PreviewCloth = {
    nodes: [
      clothNode("anchor", -1, [0, 0, 0], true),
      {
        ...clothNode("cloth", 0, [0, 0, 0]),
        bindRotation: [
          bone.quaternion.x,
          bone.quaternion.y,
          bone.quaternion.z,
          bone.quaternion.w,
        ],
      },
      { ...clothNode("$secondary", 0, [0, 0, 1]), gravity: 3600 },
      clothNode("$primary", 1, [1, 0, 0]),
    ],
    rods: [1, 2, 3].map((index) => ({
      nodes: [0, index],
      minDistance: 0,
      maxDistance: 100,
      weight0: 0,
      relaxation: 1,
    })),
    colliders: [],
    strayRadii: [],
    nodeBases,
  };
  const start = () => {
    const effect = createClothEffect(cloth)({ model });
    if (!effect) throw new Error("Fixture must produce a cloth effect");
    return effect;
  };
  return { model, anchor, bone, cloth, start };
}

function expectRotation(actual: THREE.Quaternion, expected: THREE.Quaternion) {
  expect(actual.angleTo(expected)).toBeLessThan(1e-6);
}

test("authored secondary axis captures twist while the child direction stays fixed", () => {
  const { bone, start } = fixture([BASE]);
  const animated = bone.quaternion.clone();
  const effect = start();
  effect.update(STEP);
  const expected = new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 4)
    .multiply(animated);
  expectRotation(bone.quaternion, expected);
  for (let index = 0; index < 20; index += 1) effect.update(0);
  expectRotation(bone.quaternion, expected);
  effect.dispose();
  expectRotation(bone.quaternion, animated);
});

test("swing and twist follow both axes of a deformed authored frame", () => {
  const { bone, cloth, start } = fixture([BASE]);
  cloth.nodes[3].gravity = 3600;
  const animated = bone.quaternion.clone();
  start().update(STEP);
  const delta = bone.quaternion.clone().multiply(animated.invert());
  const primary = new THREE.Vector3(1, 0, 0).applyQuaternion(delta);
  const secondary = new THREE.Vector3(0, 0, 1).applyQuaternion(delta);
  expect(
    primary.distanceTo(new THREE.Vector3(1, -1, 0).normalize()),
  ).toBeLessThan(1e-6);
  expect(
    secondary.distanceTo(new THREE.Vector3(-1, -1, 2).normalize()),
  ).toBeLessThan(1e-6);
});

test("solved twist is applied in world space under a rotated model root", () => {
  const { model, bone, start } = fixture([BASE]);
  model.position.set(-2, 3, 5);
  model.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  const animated = bone.quaternion.clone();
  start().update(STEP);
  const expected = new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 4)
    .multiply(animated);
  expectRotation(bone.quaternion, expected);
});

test("an undeformed basis preserves animated bone rotation under a transformed model", () => {
  const { model, bone, start } = fixture([BASE]);
  model.position.set(4, -3, 10);
  model.quaternion.setFromEuler(new THREE.Euler(-0.3, 1.2, 0.4));
  model.scale.setScalar(1.7);
  const animated = bone.quaternion.clone();
  const effect = start();
  effect.update(0);
  expectRotation(bone.quaternion, animated);
});

test("basis adjustment does not impose a different bind rotation", () => {
  const withAdjustment = fixture([BASE]);
  const withoutAdjustment = fixture([{ ...BASE, qAdjust: [0, 0, 0, 1] }]);
  withAdjustment.start().update(STEP);
  withoutAdjustment.start().update(STEP);
  expectRotation(
    withAdjustment.bone.quaternion,
    withoutAdjustment.bone.quaternion,
  );
});

test("absent and invalid bases retain the child-direction fallback", () => {
  const invalid: PreviewClothNodeBase[] = [
    { ...BASE, x0: -1 },
    { ...BASE, y0: 99 },
    { ...BASE, node: 1.5 },
    { ...BASE, qAdjust: [0, 0, 0, 0] },
    { ...BASE, qAdjust: [0, Number.NaN, 0, 1] },
  ];
  for (const bases of [[], ...invalid.map((base) => [base])]) {
    const { bone, start } = fixture(bases);
    const animated = bone.quaternion.clone();
    start().update(STEP);
    expectRotation(bone.quaternion, animated);
  }
});

test("collapsed and parallel frames fall back without invalid rotations", () => {
  for (const position of [
    [0, 1, 0],
    [1, 0, 0],
  ]) {
    const { bone, cloth, start } = fixture([BASE]);
    cloth.nodes[2].bindPosition = [position[0], position[1], position[2]];
    if (position[0] === 1) cloth.nodes[2].gravity = 0;
    const animated = bone.quaternion.clone();
    start().update(STEP);
    expectRotation(bone.quaternion, animated);
  }
});

test("reset reconstructs the same result without retaining solved twist", () => {
  const { bone, start } = fixture([BASE]);
  const animated = bone.quaternion.clone();
  const effect = start();
  effect.update(STEP);
  const first = bone.quaternion.clone();
  effect.update(STEP);
  effect.reset();
  effect.update(0);
  expectRotation(bone.quaternion, animated);
  effect.update(STEP);
  expectRotation(bone.quaternion, first);
});

test("large deltas are bounded and invalid deltas do not poison future stepping", () => {
  const large = fixture([BASE]);
  const bounded = fixture([BASE]);
  large.start().update(100);
  bounded.start().update(4 * STEP);
  expectRotation(large.bone.quaternion, bounded.bone.quaternion);

  const invalid = fixture([BASE]);
  const valid = fixture([BASE]);
  const effect = invalid.start();
  effect.update(Number.NaN);
  effect.update(-100);
  effect.update(Number.POSITIVE_INFINITY);
  effect.update(STEP);
  valid.start().update(STEP);
  expectRotation(invalid.bone.quaternion, valid.bone.quaternion);
});
