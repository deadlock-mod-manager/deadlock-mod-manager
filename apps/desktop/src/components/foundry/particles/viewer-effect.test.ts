import { expect, spyOn, test } from "bun:test";
import * as THREE from "three";
import { PreviewClock } from "@/lib/preview-clock";
import type { FoundryParticleGraph } from "@/types/generated/FoundryParticleGraph";
import { createSourceViewerEffect } from "./viewer-effect";
import { ParticleSprites } from "./sprite-renderer";
import { SourceParticlePlayer } from "./player";
import { ParticleSimulation } from "./simulation";

const graph: FoundryParticleGraph = {
  roots: ["smoke"],
  ambientRoots: ["smoke"],
  castRoots: [],
  releaseRoots: [],
  ability: null,
  abilityEffects: [],
  models: [],
  textures: [],
  materials: {},
  attachments: {},
  warnings: ["fixture ready"],
  systems: {
    smoke: {
      m_nMaxParticles: 8,
      m_flConstantLifespan: 10,
      m_Emitters: [
        { _class: "C_OP_InstantaneousEmitter", m_nParticlesToEmit: 4 },
      ],
      m_Renderers: [{ _class: "C_OP_RenderSprites" }],
    },
  },
};

test("four simulation steps build particle buffers only once at draw time", async () => {
  const model = new THREE.Group();
  const scene = new THREE.Scene();
  scene.add(model);
  const ready = Promise.withResolvers<void>();
  const effect = createSourceViewerEffect(graph, [], {
    modelPath: "hero.vmdl_c",
    particles: true,
    period: 0,
    releaseAt: 0,
    onWarnings: () => ready.resolve(),
  })({ model, camera: new THREE.PerspectiveCamera() });
  await ready.promise;
  const render = spyOn(ParticleSprites.prototype, "update");
  const step = spyOn(ParticleSimulation.prototype, "step");
  const clock = new PreviewClock(
    () => effect.reset(),
    (delta) => effect.update(delta),
  );
  try {
    clock.tick(4 / 60, true, 1);
    expect(clock.time).toBeCloseTo(4 / 60);
    expect(step).toHaveBeenCalledTimes(4);
    expect(render).not.toHaveBeenCalled();
    effect.update(0);
    expect(render).toHaveBeenCalledTimes(1);
    expect(step).toHaveBeenCalledTimes(4);
    // Camera-only frames refresh billboards without advancing the simulation.
    effect.update(0);
    expect(render).toHaveBeenCalledTimes(2);
    expect(step).toHaveBeenCalledTimes(4);
  } finally {
    effect.dispose();
    render.mockRestore();
    step.mockRestore();
  }
});

test("short hero clips do not reset a longer authored projectile salvo", async () => {
  const projectileGraph: FoundryParticleGraph = {
    ...graph,
    roots: ["shot"],
    ambientRoots: [],
    ability: {
      m_mapAbilityProperties: {
        BatCount: { m_strValue: "75" },
        BatPerSecond: { m_strValue: "30" },
      },
    },
    projectiles: [{ path: "shot", speed: 1800, hitParticles: [] }],
    systems: {
      shot: {
        m_Emitters: [
          { _class: "C_OP_InstantaneousEmitter", m_nParticlesToEmit: 1 },
        ],
        m_flConstantLifespan: 0.1,
        m_Operators: [{ _class: "C_OP_Decay" }],
      },
    },
  };
  const model = new THREE.Group();
  new THREE.Scene().add(model);
  const ready = Promise.withResolvers<void>();
  const effect = createSourceViewerEffect(projectileGraph, [], {
    modelPath: "hero.vmdl_c",
    particles: true,
    period: 0.5,
    releaseAt: 0,
    onWarnings: () => ready.resolve(),
  })({ model, camera: new THREE.PerspectiveCamera() });
  await ready.promise;
  const burst = spyOn(SourceParticlePlayer.prototype, "burst");
  try {
    for (let i = 0; i < 150; i++) effect.update(1 / 60);
    expect(burst).toHaveBeenCalledTimes(75);
  } finally {
    burst.mockRestore();
    effect.dispose();
  }
});
