import { expect, test } from "bun:test";
import * as THREE from "three";
import type { FoundryParticleGraph } from "@/types/generated/FoundryParticleGraph";
import type { ParticleSheetFrame } from "@/types/generated/ParticleSheetFrame";
import { ParticleAssets } from "./assets";
import { ParticleSimulation } from "./simulation";
import { ParticleSprites } from "./sprite-renderer";
import { Particle, type Fields } from "./values";

const sprite = (options: Fields) => {
  const graph: FoundryParticleGraph = {
    roots: [],
    ambientRoots: [],
    castRoots: [],
    releaseRoots: [],
    ability: null,
    abilityEffects: [],
    systems: {},
    attachments: {},
    textures: [],
    models: [],
    materials: {},
    warnings: [],
  };
  const assets = new ParticleAssets(graph, []);
  const frames: ParticleSheetFrame[] = [
    { duration: 1, min: [0, 0], max: [0.5, 1] },
    { duration: 1, min: [0.5, 0], max: [1, 1] },
  ];
  for (const path of ["smoke", "noise", "gradient", "mask"])
    assets.textures.set(path, {
      texture: new THREE.Texture(),
      sheet: { path, dataUrl: "", sequences: [frames] },
    });
  const simulation = new ParticleSimulation({}, {});
  const particle = new Particle(0, 0, new THREE.Vector3(1, 1, 1), 1, 0.4);
  simulation.particles.push(particle);
  const renderer = new ParticleSprites(
    {
      _class: "C_OP_RenderSprites",
      m_vecTexturesInput: ["smoke", "noise", "gradient", "mask"].map(
        (m_hTexture) => ({ m_hTexture }),
      ),
      m_flAnimationRate: 1,
      ...options,
    },
    simulation,
    assets,
  );
  const mesh = renderer.root.children[0];
  if (!(mesh instanceof THREE.Mesh)) throw Error("Missing smoke sprite");
  return { particle, renderer, geometry: mesh.geometry, assets };
};

test("supplies atlas coordinates for every layer of Bebop's four-layer dust", () => {
  const { particle, renderer, geometry, assets } = sprite({
    m_nAnimationType: "ANIMATION_TYPE_FIT_LIFETIME",
  });
  particle.age = 0.3;
  renderer.update(new THREE.PerspectiveCamera(), new THREE.Group(), 1);
  for (let i = 0; i < 4; i++) {
    const rect = geometry.getAttribute(`rect${i}`);
    expect(rect).toBeDefined();
    expect([rect.getX(0), rect.getY(0), rect.getZ(0), rect.getW(0)]).toEqual([
      0.5, 0, 1, 1,
    ]);
  }
  renderer.dispose();
  assets.dispose();
});

test("interprets fixed-rate sheet animation as passes and preserves FPS timing", () => {
  for (const [fps, expected] of [
    [false, 0.5],
    [true, 0],
  ] satisfies [boolean, number][]) {
    const { particle, renderer, geometry, assets } = sprite({
      m_bAnimateInFPS: fps,
    });
    particle.age = 0.75;
    renderer.update(new THREE.PerspectiveCamera(), new THREE.Group(), 1);
    expect(geometry.getAttribute("rect0").getX(0)).toBe(expected);
    renderer.dispose();
    assets.dispose();
  }
});

test("keeps a world-Z ground ring flat when the camera tilts", () => {
  const { renderer, geometry, assets } = sprite({
    m_nOrientationType: "PARTICLE_ORIENTATION_WORLD_Z_ALIGNED",
  });
  const camera = new THREE.PerspectiveCamera();
  camera.rotation.set(0.7, 0.3, 0);
  renderer.update(camera, new THREE.Group(), 1);
  const x = geometry.getAttribute("axisX"),
    y = geometry.getAttribute("axisY");
  expect(x.getZ(0)).toBeCloseTo(0);
  expect(y.getZ(0)).toBeCloseTo(0);
  renderer.dispose();
  assets.dispose();
});
