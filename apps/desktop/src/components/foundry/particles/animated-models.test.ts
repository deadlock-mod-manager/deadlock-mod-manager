import { expect, test } from "bun:test";
import * as THREE from "three";
import { AnimatedParticleModels } from "./animated-models";
import { ParticleAssets } from "./assets";
import { ParticleSimulation } from "./simulation";
import { Particle } from "./values";
import type { FoundryParticleGraph } from "@/types/generated/FoundryParticleGraph";

test("animated model particles sample individual manual frames without mutating the source rig", () => {
  const graph: FoundryParticleGraph = {
    roots: [],
    ambientRoots: [],
    castRoots: [],
    releaseRoots: [],
    ability: null,
    abilityEffects: [],
    systems: {},
    models: [],
    materials: {},
    textures: [],
    attachments: {},
    warnings: [],
  };
  const source = new THREE.Group();
  const bone = new THREE.Bone();
  bone.name = "wing";
  source.add(bone);
  const geometry = new THREE.BoxGeometry();
  const original = new THREE.MeshBasicMaterial();
  bone.add(new THREE.Mesh(geometry, original));
  const simulation = new ParticleSimulation({}, {});
  const p1 = new Particle(0, 0, new THREE.Vector3(1, 1, 1), 1, 2),
    p2 = new Particle(1, 0, new THREE.Vector3(1, 1, 1), 1, 2);
  p1.values[38] = 0;
  p2.values[38] = 1;
  simulation.particles.push(p1, p2);
  const animation = {
    duration: 1,
    times: [0, 1],
    tracks: [
      {
        name: "wing",
        positions: [0, 0, 0, 0, 2, 0],
        rotations: [0, 0, 0, 1, 0, 0, 0, 1],
        scales: [1, 1, 1, 1, 1, 1],
      },
    ],
    segments: [],
  };
  const assets = new ParticleAssets(graph, []);
  const renderer = new AnimatedParticleModels(
    source,
    animation,
    { m_bManualAnimFrame: true, m_nManualFrameField: 38 },
    simulation,
    assets,
  );
  renderer.update(1);
  expect(
    renderer.root.children[0].getObjectByName("wing")?.position.y,
  ).toBeCloseTo(0);
  expect(
    renderer.root.children[1].getObjectByName("wing")?.position.y,
  ).toBeCloseTo(2);
  expect(bone.position.y).toBe(0);
  simulation.particles.pop();
  renderer.update(1);
  expect(renderer.root.children).toHaveLength(1);
  renderer.dispose();
  assets.dispose();
  geometry.dispose();
  original.dispose();
});

test("embedded morph clips flap separate model particles without changing shared geometry", () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
  );
  geometry.morphAttributes.position = [
    new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 1, 0, 0, 1], 3),
  ];
  geometry.morphTargetsRelative = true;
  const source = new THREE.Group();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.name = "bat";
  source.add(mesh);
  const clip = new THREE.AnimationClip("flap", 0.2, [
    new THREE.NumberKeyframeTrack(
      "bat.morphTargetInfluences[0]",
      [0, 0.1, 0.2],
      [0, 1, 0],
    ),
  ]);
  const simulation = new ParticleSimulation({}, {});
  for (let id = 0; id < 2; id++) {
    const particle = new Particle(id, 0, new THREE.Vector3(1, 1, 1), 1, 1);
    particle.values[38] = id;
    particle.vector(17).set(1, 0.24, 0.28);
    simulation.particles.push(particle);
  }
  const graph: FoundryParticleGraph = {
    roots: [],
    ambientRoots: [],
    castRoots: [],
    releaseRoots: [],
    ability: null,
    abilityEffects: [],
    systems: {},
    models: [],
    materials: {},
    textures: [],
    attachments: {},
    warnings: [],
  };
  const assets = new ParticleAssets(graph, []);
  const renderer = new AnimatedParticleModels(
    source,
    clip,
    {
      m_bManualAnimFrame: true,
      m_bForceLoopingAnimation: true,
      m_MaterialVars: [
        { m_strVariable: "$SELFILLUMCOLOR", m_nVariableField: 17 },
      ],
    },
    simulation,
    assets,
  );
  renderer.update(1);
  const poses: number[] = [];
  renderer.root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      poses.push(object.morphTargetInfluences?.[0] ?? -1);
      expect(object.geometry).toBe(geometry);
      if (object.material instanceof THREE.MeshBasicMaterial)
        expect(object.material.color.g).toBeCloseTo(0.24);
    }
  });
  expect(poses[0]).toBeCloseTo(0);
  expect(poses[1]).toBeCloseTo(1);
  expect(mesh.morphTargetInfluences).toEqual([0]);
  renderer.dispose();
  assets.dispose();
  geometry.dispose();
  mesh.material.dispose();
});
