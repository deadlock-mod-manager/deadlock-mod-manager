import { describe, expect, test } from "bun:test";
import { ParticleSimulation } from "./simulation";
import {
  particleSystemsInUse,
  mergeParticleSystemsInUse,
  referencedParticleSystems,
} from "./systems-in-use";
import type { Fields } from "./values";

function definition(children: Fields[] = []): Fields {
  return {
    m_Emitters: [
      { _class: "C_OP_InstantaneousEmitter", m_nParticlesToEmit: 1 },
    ],
    m_flConstantLifespan: 1,
    m_Operators: [{ _class: "C_OP_Decay" }],
    m_Children: children,
  };
}

describe("particle systems in use", () => {
  test("retains pending references and marks missing roots and children", () => {
    const systems = referencedParticleSystems({
      roots: ["parent.vpcf", "missing.vpcf"],
      systems: {
        "parent.vpcf": definition([{ m_ChildRef: "missing-child.vpcf" }]),
      },
    });
    expect(systems).toEqual([
      { path: "parent.vpcf", active: false, limited: false, missing: false },
      { path: "missing.vpcf", active: false, limited: false, missing: true },
      {
        path: "missing-child.vpcf",
        active: false,
        limited: false,
        missing: true,
      },
    ]);
  });
  test("tracks delayed children and clears finished tails", () => {
    const parent = definition([{ m_ChildRef: "child.vpcf", m_flDelay: 0.5 }]);
    const child = definition();
    const systems = { "parent.vpcf": parent, "child.vpcf": child };
    const simulation = new ParticleSimulation(parent, systems);
    simulation.step(0.1);
    expect(
      particleSystemsInUse([simulation], systems).map((entry) => entry.path),
    ).toEqual(["parent.vpcf"]);
    simulation.step(0.5);
    simulation.step(0.1);
    expect(
      particleSystemsInUse([simulation], systems)
        .filter((entry) => entry.active)
        .map((entry) => entry.path),
    ).toEqual(["child.vpcf", "parent.vpcf"]);
    simulation.stop();
    simulation.step(2);
    expect(particleSystemsInUse([simulation], systems)).toEqual([]);
  });

  test("endcaps appear only after their parent stops", () => {
    const parent = definition([{ m_ChildRef: "end.vpcf", m_bEndCap: true }]);
    const child = definition();
    const systems = { "parent.vpcf": parent, "end.vpcf": child };
    const simulation = new ParticleSimulation(parent, systems);
    simulation.step(0.1);
    expect(
      particleSystemsInUse([simulation], systems).map((entry) => entry.path),
    ).toEqual(["parent.vpcf"]);
    simulation.stop();
    simulation.step(0.1);
    expect(
      particleSystemsInUse([simulation], systems).find(
        (entry) => entry.path === "end.vpcf",
      )?.active,
    ).toBe(true);
  });

  test("deduplicates concurrent effects without losing live or limited status", () => {
    expect(
      mergeParticleSystemsInUse([
        [
          {
            path: "effect.vpcf",
            active: false,
            limited: false,
            missing: false,
          },
        ],
        [{ path: "effect.vpcf", active: true, limited: true, missing: false }],
      ]),
    ).toEqual([
      { path: "effect.vpcf", active: true, limited: true, missing: false },
    ]);
  });
});
