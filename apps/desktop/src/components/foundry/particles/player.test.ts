import { expect, spyOn, test } from "bun:test";
import * as THREE from "three";
import type { FoundryParticleGraph } from "@/types/generated/FoundryParticleGraph";
import { ParticleAssets } from "./assets";
import { SourceParticlePlayer } from "./player";
import { ParticleSimulation } from "./simulation";

const graph: FoundryParticleGraph = {
  roots: [],
  ambientRoots: [],
  castRoots: [],
  releaseRoots: [],
  ability: null,
  abilityEffects: [],
  models: [],
  textures: [],
  materials: {},
  attachments: {},
  warnings: [],
  systems: {
    hit: {
      m_Emitters: [
        { _class: "C_OP_InstantaneousEmitter", m_nParticlesToEmit: 1 },
      ],
      m_flConstantLifespan: 0.1,
      m_Operators: [{ _class: "C_OP_Decay" }],
    },
  },
};

test("stationary impact bursts emit once before stopping and dispose their tails", async () => {
  const assets = new ParticleAssets(graph, []);
  const rig = new THREE.Group();
  new THREE.Scene().add(rig);
  const player = new SourceParticlePlayer(assets, rig, () => {});
  await assets.ready;
  const original = ParticleSimulation.prototype.step;
  const particles: number[] = [];
  const step = spyOn(ParticleSimulation.prototype, "step").mockImplementation(
    function (this: ParticleSimulation, dt) {
      original.call(this, dt);
      particles.push(this.particles.length);
    },
  );
  try {
    expect(
      player.burst({
        root: "hit",
        speed: 0,
        distance: 0,
        interval: 0,
        count: 1,
        attachment: "",
        position: new THREE.Vector3(10, 20, 30),
      }),
    ).toBe(true);
    player.update(1 / 60, new THREE.PerspectiveCamera());
    expect(particles[0]).toBe(1);
    player.update(0.2, new THREE.PerspectiveCamera());
    expect(particles.at(-1)).toBe(0);
    const calls = particles.length;
    player.update(1 / 60, new THREE.PerspectiveCamera());
    expect(particles.length).toBe(calls);
  } finally {
    step.mockRestore();
    player.dispose();
    assets.dispose();
  }
});

test("moving projectiles report one impact at the endpoint and ignore later caster movement", async () => {
  const assets = new ParticleAssets(graph, []);
  const rig = new THREE.Group();
  new THREE.Scene().add(rig);
  const player = new SourceParticlePlayer(assets, rig, () => {});
  await assets.ready;
  const hits: THREE.Vector3[] = [];
  player.burst({
    root: "hit",
    speed: 100,
    distance: 10,
    interval: 0,
    count: 1,
    attachment: "",
    position: new THREE.Vector3(1, 2, 3),
    onImpact: (position) => hits.push(position),
  });
  const camera = new THREE.PerspectiveCamera();
  player.update(0.05, camera);
  rig.position.x = 100;
  player.update(0.1, camera);
  player.update(0.1, camera);
  expect(hits).toHaveLength(1);
  expect(hits[0].toArray()).toEqual([11, 2, 3]);
  player.dispose();
  assets.dispose();
});

test("successive projectiles spread around their attachment instead of stacking at one seeded offset", async () => {
  const assets = new ParticleAssets(graph, []);
  const rig = new THREE.Group();
  new THREE.Scene().add(rig);
  const player = new SourceParticlePlayer(assets, rig, () => {});
  await assets.ready;
  const original = ParticleSimulation.prototype.step;
  const positions: THREE.Vector3[] = [];
  const step = spyOn(ParticleSimulation.prototype, "step").mockImplementation(
    function (this: ParticleSimulation, dt) {
      original.call(this, dt);
      positions.push(this.particles[0].vector(0).clone());
    },
  );
  try {
    for (let i = 0; i < 10; i++)
      player.burst({
        root: "hit",
        speed: 100,
        distance: 100,
        spawnRadius: 10,
        count: 1,
        interval: 0,
        attachment: "",
      });
    player.update(1 / 60, new THREE.PerspectiveCamera());
    const extent = new THREE.Box3()
      .setFromPoints(positions)
      .getSize(new THREE.Vector3());
    expect(extent.y).toBeGreaterThan(10);
    expect(extent.z).toBeGreaterThan(10);
  } finally {
    step.mockRestore();
    player.dispose();
    assets.dispose();
  }
});

test("multiple moving bursts prepare the animated owner only for their initial attachment lookup", async () => {
  const assets = new ParticleAssets(graph, []);
  const rig = new THREE.Group();
  new THREE.Scene().add(rig);
  const player = new SourceParticlePlayer(assets, rig, () => {});
  await assets.ready;
  const matrices = spyOn(rig, "updateWorldMatrix");
  try {
    for (let i = 0; i < 10; i++)
      player.burst({
        root: "hit",
        speed: 100,
        distance: 100,
        count: 1,
        interval: 0,
        attachment: "",
      });
    player.update(1 / 60, new THREE.PerspectiveCamera());
    expect(matrices).toHaveBeenCalledTimes(1);
    player.update(1 / 60, new THREE.PerspectiveCamera());
    expect(matrices).toHaveBeenCalledTimes(1);
  } finally {
    matrices.mockRestore();
    player.dispose();
    assets.dispose();
  }
});
