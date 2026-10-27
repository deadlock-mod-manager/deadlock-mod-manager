import { describe, expect, it } from "bun:test";
import { ParticleSimulation } from "./simulation";
import { cp, type Fields } from "./values";

describe("compiled particle simulation", () => {
  it("emits an authored burst and decays it at its lifetime", () => {
    const simulation = new ParticleSimulation(
      {
        m_nMaxParticles: 8,
        m_flConstantLifespan: 0.2,
        m_Emitters: [
          { _class: "C_OP_InstantaneousEmitter", m_nParticlesToEmit: 4 },
        ],
        m_Operators: [{ _class: "C_OP_Decay" }],
      },
      {},
    );
    simulation.step(0.01);
    expect(simulation.particles).toHaveLength(4);
    for (let i = 0; i < 20; i++) simulation.step(0.01);
    expect(simulation.particles).toHaveLength(0);
  });
  it("pins a beam path to its moving control points and passes the midpoint to children", () => {
    const child: Fields = {
      m_nMaxParticles: 3,
      m_Emitters: [
        { _class: "C_OP_InstantaneousEmitter", m_nParticlesToEmit: 3 },
      ],
      m_Initializers: [
        {
          _class: "C_INIT_CreateSequentialPathV2",
          m_flNumToAssign: 3,
          m_PathParams: { m_nEndControlPointNumber: 1 },
        },
      ],
      m_Operators: [
        {
          _class: "C_OP_MaintainSequentialPath",
          m_PathParams: { m_nEndControlPointNumber: 1 },
        },
      ],
    };
    const parent: Fields = {
      ...child,
      m_Children: [{ m_ChildRef: "beam" }],
      m_Operators: [
        {
          _class: "C_OP_MaintainSequentialPath",
          m_PathParams: { m_nEndControlPointNumber: 1 },
        },
        {
          _class: "C_OP_SetChildControlPoints",
          m_nFirstControlPoint: 4,
          m_nFirstSourcePoint: 1,
        },
      ],
    };
    const simulation = new ParticleSimulation(parent, { beam: child });
    cp(simulation.context, 0).position.set(10, 0, 0);
    cp(simulation.context, 1).position.set(110, 0, 0);
    cp(simulation.context, 5).position.set(7, 8, 9);
    simulation.step(1 / 60);
    expect(simulation.particles.map((p) => p.vector(0).x)).toEqual([
      10, 60, 110,
    ]);
    expect(cp(simulation.children[0].simulation.context, 4).position.x).toBe(
      60,
    );
    expect(
      cp(simulation.children[0].simulation.context, 5).position.toArray(),
    ).toEqual([7, 8, 9]);
    cp(simulation.context, 0).position.x = 30;
    simulation.step(1 / 60);
    expect(simulation.children[0].simulation.particles[0].vector(0).x).toBe(30);
  });
  it("keeps continuous emission stable across frame rates and stops without respawning", () => {
    const counts = [];
    for (const fps of [30, 60, 120]) {
      const simulation = new ParticleSimulation(
        {
          m_nMaxParticles: 100,
          m_Emitters: [{ _class: "C_OP_ContinuousEmitter", m_flEmitRate: 60 }],
          m_Operators: [{ _class: "C_OP_Decay" }],
        },
        {},
      );
      for (let i = 0; i < fps / 2; i++) simulation.step(1 / fps);
      counts.push(simulation.particles.length);
      simulation.stop();
      for (let i = 0; i < fps * 2; i++) simulation.step(1 / fps);
      expect(simulation.particles).toHaveLength(0);
    }
    expect(counts).toEqual([30, 30, 30]);
  });
  it("hands Drifter's left and right muzzle transforms to separate child systems", () => {
    const glow: Fields = {
      m_nMaxParticles: 1,
      m_Emitters: [
        { _class: "C_OP_InstantaneousEmitter", m_nParticlesToEmit: 1 },
      ],
      m_Initializers: [
        {
          _class: "C_INIT_CreateWithinSphereTransform",
          m_TransformInput: { m_nControlPoint: 3 },
        },
      ],
    };
    const simulation = new ParticleSimulation(
      {
        m_PreEmissionOperators: [
          {
            _class: "C_OP_SetParentControlPointsToChildCP",
            m_bSetOrientation: true,
            m_nChildControlPoint: 3,
            m_nFirstSourcePoint: 1,
            m_nNumControlPoints: 2,
          },
        ],
        m_Children: [{ m_ChildRef: "glow" }, { m_ChildRef: "glow" }],
      },
      { glow },
    );
    cp(simulation.context, 1).position.set(-20, 0, 50);
    cp(simulation.context, 2).position.set(20, 0, 50);
    simulation.step(1 / 60);
    expect(
      simulation.children.map(
        ({ simulation: child }) => child.particles[0].vector(0).x,
      ),
    ).toEqual([-20, 20]);
  });
  it("bounds particle allocation and reports unsupported operators", () => {
    const simulation = new ParticleSimulation(
      {
        m_nMaxParticles: 100000,
        m_Emitters: [
          { _class: "C_OP_InstantaneousEmitter", m_nParticlesToEmit: 1000000 },
        ],
        m_Operators: [{ _class: "C_OP_FutureFeature" }],
      },
      {},
    );
    simulation.step(0.01);
    expect(simulation.particles.length).toBe(512);
    expect(simulation.unsupported.has("C_OP_FutureFeature")).toBe(true);
  });
  it("bounds child graph expansion and rejects recursive child references", () => {
    const cycle: Fields = { m_Children: [{ m_ChildRef: "loop" }] };
    const recursive = new ParticleSimulation(cycle, { loop: cycle });
    expect(recursive.all()).toHaveLength(1);
    expect(recursive.unsupported.has("Cyclic particle child: loop")).toBe(true);
    const leaf: Fields = {},
      branch: Fields = {
        m_Children: Array.from({ length: 32 }, () => ({ m_ChildRef: "leaf" })),
      };
    const root: Fields = {
      m_Children: Array.from({ length: 32 }, () => ({ m_ChildRef: "branch" })),
    };
    const wide = new ParticleSimulation(root, { branch, leaf });
    expect(wide.all().length).toBeLessThanOrEqual(128);
  });
});
