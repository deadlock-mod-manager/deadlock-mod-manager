import { expect, test } from "bun:test";
import * as THREE from "three";
import type { FoundryParticleGraph } from "@/types/generated/FoundryParticleGraph";
import { ParticleAssets } from "./assets";
import { ParticleBeamLights } from "./beam-lights";
import { ParticleRibbon } from "./ribbon-renderer";
import { ParticleProjected } from "./projected-renderer";
import { ParticleSimulation } from "./simulation";
import { Particle } from "./values";

const graph: FoundryParticleGraph = {
  roots: [],
  ambientRoots: [],
  castRoots: [],
  releaseRoots: [],
  models: [],
  textures: [],
  materials: {
    floor: { m_textureParams: [{ m_name: "g_tColor", m_pValue: "ring" }] },
  },
  systems: {},
  attachments: {},
  warnings: [],
  ability: null,
  abilityEffects: [],
};

test("floor projections stay on their receiver and respect authored projection depth", () => {
  const assets = new ParticleAssets(graph, []);
  assets.textures.set("ring", {
    texture: new THREE.Texture(),
    sheet: { path: "ring", dataUrl: "", sequences: [] },
  });
  const simulation = new ParticleSimulation({}, {});
  const particle = new Particle(0, 0, new THREE.Vector3(1, 0, 0), 10, 1);
  particle.vector(0).set(20, 30, 50);
  simulation.particles.push(particle);
  const renderer = new ParticleProjected(
    {
      m_vecProjectedMaterials: [{ m_hMaterial: "floor" }],
      m_flMinProjectionDepth: -100,
      m_flMaxProjectionDepth: 100,
    },
    simulation,
    assets,
  );
  const mesh = renderer.root.children[0];
  if (!(mesh instanceof THREE.Mesh)) throw new Error("Missing projection");
  const camera = new THREE.PerspectiveCamera();
  camera.rotation.set(1, 0.5, 0);
  renderer.update(camera, new THREE.Group(), 1);
  expect(mesh.geometry.getAttribute("center").getZ(0)).toBeCloseTo(0.05);
  expect(mesh.geometry.getAttribute("axisX").getZ(0)).toBe(0);
  expect(mesh.geometry.getAttribute("rgba").getW(0)).toBe(1);
  particle.vector(0).z = 200;
  renderer.update(camera, new THREE.Group(), 1);
  expect(mesh.geometry.getAttribute("rgba").getW(0)).toBe(0);
  renderer.dispose();
  assets.dispose();
});

test("beam lighting follows the particle span without adding beam geometry or shadow maps", () => {
  const simulation = new ParticleSimulation({}, {});
  for (let i = 0; i < 2; i++) {
    const particle = new Particle(i, 0, new THREE.Vector3(1, 0, 0), 10, 1);
    particle.vector(0).x = i * 100;
    simulation.particles.push(particle);
  }
  const renderer = new ParticleBeamLights({}, simulation);
  renderer.update(new THREE.PerspectiveCamera(), new THREE.Group(), 1);
  for (const child of renderer.root.children) {
    expect(child instanceof THREE.PointLight).toBe(true);
    if (!(child instanceof THREE.PointLight)) continue;
    expect(child.position.x).toBeGreaterThan(0);
    expect(child.position.x).toBeLessThan(100);
    expect(child.intensity).toBeGreaterThan(0);
    expect(child.color.r).toBe(1);
    expect(child.color.g).toBe(0);
    expect(child.castShadow).toBe(false);
  }
  simulation.particles.length = 0;
  renderer.update(new THREE.PerspectiveCamera(), new THREE.Group(), 1);
  expect(renderer.root.children.every((child) => !child.visible)).toBe(true);
  renderer.dispose();
  expect(renderer.root.children).toHaveLength(0);
});

test("off-camera ribbons skip geometry work and resume when the camera returns", () => {
  const assets = new ParticleAssets(graph, []);
  assets.textures.set("ring", {
    texture: new THREE.Texture(),
    sheet: { path: "ring", dataUrl: "", sequences: [] },
  });
  const simulation = new ParticleSimulation({}, {});
  for (let i = 0; i < 3; i++) {
    const p = new Particle(i, 0, new THREE.Vector3(1, 1, 1), 1, 1);
    p.vector(0).set(i, 0, 0);
    simulation.particles.push(p);
  }
  const renderer = new ParticleRibbon(
    { m_hTexture: "ring" },
    simulation,
    assets,
  );
  const mesh = renderer.root.children[0];
  if (!(mesh instanceof THREE.Mesh)) throw new Error("Missing ribbon");
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.set(0, 0, 20);
  camera.lookAt(0, 0, 0);
  renderer.update(camera, new THREE.Group(), 1);
  expect(mesh.visible).toBe(true);
  expect(mesh.geometry.drawRange.count).toBeGreaterThan(0);
  for (const p of simulation.particles) p.vector(0).x += 1000;
  const version = mesh.geometry.getAttribute("position").version;
  renderer.update(camera, new THREE.Group(), 1);
  expect(mesh.visible).toBe(false);
  expect(mesh.geometry.getAttribute("position").version).toBe(version);
  camera.position.x = 1000;
  camera.lookAt(1000, 0, 0);
  renderer.update(camera, new THREE.Group(), 1);
  expect(mesh.visible).toBe(true);
  expect(mesh.geometry.getAttribute("position").version).toBeGreaterThan(
    version,
  );
  renderer.dispose();
  assets.dispose();
});
