import { expect, test } from "bun:test";
import { Vector3 } from "three";
import { compileSystem, type DefinitionFile } from "./compiler";
import { ParticleHierarchy } from "./hierarchy";
import type { JsonObject } from "./json";
import { FIELD } from "./types";

const file = (
  path: string,
  definition: JsonObject = {},
  children: DefinitionFile[] = [],
): DefinitionFile => ({
  path,
  children,
  definition: {
    m_nMaxParticles: 8,
    m_flConstantLifespan: 4,
    m_Emitters: [
      { _class: "C_OP_InstantaneousEmitter", m_nParticlesToEmit: 1 },
    ],
    ...definition,
  },
});

test("child delays clip the activation step and nested delays accumulate", () => {
  const hierarchy = new ParticleHierarchy(
    compileSystem(
      file(
        "root",
        {
          m_Children: [{ m_ChildRef: "child.vpcf", m_flDelay: 0.5 }],
        },
        [
          file(
            "child.vpcf_c",
            {
              m_Children: [{ m_ChildRef: "grandchild", m_flDelay: 0.25 }],
            },
            [file("grandchild")],
          ),
        ],
      ),
    ),
  );
  hierarchy.update(0.5);
  expect(hierarchy.nodes[1].system.count).toBe(1);
  expect(hierarchy.nodes[1].system.age).toBe(0);
  expect(hierarchy.nodes[2].system.count).toBe(0);
  hierarchy.update(0.375);
  expect(hierarchy.nodes[1].system.age).toBe(0.375);
  expect(hierarchy.nodes[2].system.age).toBe(0.125);
  expect(hierarchy.nodes[1].system.count).toBe(1);
});

test("release stops emission, retains particles and triggers delayed end caps once", () => {
  const hierarchy = new ParticleHierarchy(
    compileSystem(
      file(
        "root",
        {
          m_Emitters: [{ _class: "C_OP_ContinuousEmitter", m_flEmitRate: 8 }],
          m_Children: [
            { m_ChildRef: "endcap", m_bEndCap: true, m_flDelay: 0.25 },
          ],
        },
        [file("endcap")],
      ),
    ),
  );
  hierarchy.update(0.5);
  expect(hierarchy.nodes[0].system.count).toBe(4);
  expect(hierarchy.nodes[1].system.count).toBe(0);
  hierarchy.release();
  hierarchy.update(0.125);
  expect(hierarchy.nodes[1].system.count).toBe(0);
  hierarchy.release();
  hierarchy.update(0.125);
  expect(hierarchy.nodes[0].system.count).toBe(4);
  expect(hierarchy.nodes[0].state).toBe("ending");
  expect(hierarchy.nodes[1].system.count).toBe(1);
  hierarchy.update(0.125);
  expect(hierarchy.nodes[1].system.count).toBe(1);
});

test("ordinary children that have not started at release are cancelled", () => {
  const hierarchy = new ParticleHierarchy(
    compileSystem(
      file(
        "root",
        {
          m_Children: [{ m_ChildRef: "child", m_flDelay: 2 }],
        },
        [file("child")],
      ),
    ),
  );
  hierarchy.update(0.25);
  hierarchy.release();
  hierarchy.update(4);
  expect(hierarchy.nodes[1].state).toBe("cancelled");
  expect(hierarchy.nodes[1].system.count).toBe(0);
});

test("normal descendants of an end-cap child keep their release-relative delays", () => {
  const hierarchy = new ParticleHierarchy(
    compileSystem(
      file(
        "root",
        {
          m_Children: [
            { m_ChildRef: "endcap", m_bEndCap: true, m_flDelay: 0.5 },
          ],
        },
        [
          file(
            "endcap",
            {
              m_Children: [{ m_ChildRef: "grandchild", m_flDelay: 0.25 }],
            },
            [file("grandchild")],
          ),
        ],
      ),
    ),
  );
  hierarchy.update(1);
  hierarchy.release();
  hierarchy.update(0.5);
  expect(hierarchy.nodes[1].system.count).toBe(1);
  expect(hierarchy.nodes[2].system.count).toBe(0);
  hierarchy.update(0.25);
  expect(hierarchy.nodes[2].system.count).toBe(1);
});

test("endcap emitters use release-relative time and active-only operators stop", () => {
  const hierarchy = new ParticleHierarchy(
    compileSystem(
      file("root", {
        m_Emitters: [
          { _class: "C_OP_InstantaneousEmitter", m_nParticlesToEmit: 1 },
          {
            _class: "C_OP_InstantaneousEmitter",
            m_nParticlesToEmit: 1,
            m_nOpEndCapState: "PARTICLE_ENDCAP_ENDCAP_ON",
            m_flStartTime: 0.25,
          },
        ],
        m_Operators: [
          {
            _class: "C_OP_SetFloat",
            m_nOutputField: FIELD.radius,
            m_InputValue: 9,
            m_nOpEndCapState: "PARTICLE_ENDCAP_ENDCAP_OFF",
          },
        ],
      }),
    ),
  );
  hierarchy.update(1);
  const system = hierarchy.nodes[0].system;
  expect(system.count).toBe(1);
  expect(system.scalar(FIELD.radius)[0]).toBe(9);
  hierarchy.release();
  system.scalar(FIELD.radius)[0] = 3;
  hierarchy.update(0.125);
  expect(system.count).toBe(1);
  expect(system.scalar(FIELD.radius)[0]).toBe(3);
  hierarchy.update(0.125);
  expect(system.count).toBe(2);
});

test("child CP registries inherit rotations but cannot change siblings or their parent", () => {
  const hierarchy = new ParticleHierarchy(
    compileSystem(file("root", {}, [file("child"), file("sibling")])),
  );
  const root = hierarchy.nodes[0];
  const child = hierarchy.nodes[1];
  const sibling = hierarchy.nodes[2];
  hierarchy.placeControlPoints((node) => {
    if (node === root) {
      node.controlPoints[0].position.set(1, 2, 3);
      node.controlPoints[0].rotation.setFromAxisAngle(
        new Vector3(0, 0, 1),
        Math.PI / 2,
      );
    }
    if (node === child)
      node.controlPoints[0].position.add(
        new Vector3(2, 0, 0).applyQuaternion(node.controlPoints[0].rotation),
      );
  }, true);
  expect(child.controlPoints[0].position.x).toBeCloseTo(1);
  expect(child.controlPoints[0].position.y).toBeCloseTo(4);
  expect(sibling.controlPoints[0].position.toArray()).toEqual([1, 2, 3]);
  expect(root.controlPoints[0].position.toArray()).toEqual([1, 2, 3]);
  expect(child.controlPoints[0].previousPosition.toArray()).toEqual(
    child.controlPoints[0].position.toArray(),
  );
  hierarchy.placeControlPoints((node) => {
    if (node === root) node.controlPoints[0].position.x = 5;
  }, false);
  expect(child.controlPoints[0].previousPosition.y).toBeCloseTo(4);
  expect(child.controlPoints[0].position.x).toBe(5);
});

test("pre-emission CP inputs read each system's own charge/target registry", () => {
  const hierarchy = new ParticleHierarchy(
    compileSystem(
      file("root", {}, [
        file("child", {
          m_PreEmissionOperators: [
            {
              _class: "C_OP_SetSingleControlPointPosition",
              m_nCP1: 3,
              m_vecCP1Pos: {
                m_nType: "PVEC_TYPE_CP_VALUE",
                m_nControlPoint: 2,
              },
            },
          ],
        }),
      ]),
    ),
  );
  hierarchy.placeControlPoints((node) => {
    node.controlPoints[2].position.x = node.parent ? 0.75 : 0.25;
  }, true);
  expect(hierarchy.nodes[1].controlPoints[3].position.x).toBe(0.75);
  expect(hierarchy.nodes[0].controlPoints[3].position.x).toBe(0);
});

test("SetChildControlPoints writes children without moving the parent's own CP", () => {
  const hierarchy = new ParticleHierarchy(
    compileSystem(
      file(
        "root",
        {
          m_Initializers: [
            {
              _class: "C_INIT_CreateWithinBox",
              m_vecMin: [10, 0, 0],
              m_vecMax: [10, 0, 0],
            },
          ],
          m_Operators: [
            { _class: "C_OP_SetChildControlPoints", m_nFirstControlPoint: 1 },
          ],
        },
        [file("child")],
      ),
    ),
  );
  hierarchy.update(0.125);
  expect(hierarchy.nodes[0].controlPoints[1].position.x).toBe(0);
  expect(hierarchy.nodes[1].controlPoints[1].position.x).toBe(10);
});

test("reset and fixed-step resimulation reproduce child and endcap seeded output", () => {
  const hierarchy = new ParticleHierarchy(
    compileSystem(
      file(
        "root",
        {
          m_Children: [
            { m_ChildRef: "child", m_bEndCap: true, m_flDelay: 0.125 },
          ],
        },
        [
          file("child", {
            m_Initializers: [
              {
                _class: "C_INIT_InitFloat",
                m_nOutputField: FIELD.radius,
                m_InputValue: {
                  m_nType: "PF_TYPE_RANDOM_UNIFORM",
                  m_flRandomMin: 2,
                  m_flRandomMax: 9,
                },
              },
            ],
          }),
        ],
      ),
    ),
  );
  const replay = (seed: number) => {
    hierarchy.reset(seed);
    for (let frame = 0; frame < 12; frame += 1) {
      if (frame === 4) hierarchy.release();
      hierarchy.update(0.125);
    }
    return hierarchy.nodes.map(({ system, state }) => ({
      state,
      age: system.age,
      count: system.count,
      radius: Array.from(system.scalar(FIELD.radius)),
      position: Array.from(system.vector(FIELD.position)),
    }));
  };
  const first = replay(17);
  expect(replay(17)).toEqual(first);
  expect(replay(23)).not.toEqual(first);
});

test("zero-particle orchestrators retain CP operators and healthy children", () => {
  const hierarchy = new ParticleHierarchy(
    compileSystem(file("root", { m_nMaxParticles: 0 }, [file("child")])),
  );
  hierarchy.update(1);
  expect(hierarchy.nodes[0].system.count).toBe(0);
  expect(hierarchy.nodes[0].system.scalar(FIELD.radius)).toHaveLength(0);
  expect(hierarchy.nodes[1].system.count).toBe(1);
});

test("repeated child references retain independent authored delays and disabled children are skipped", () => {
  const compiled = compileSystem(
    file(
      "root",
      {
        m_Children: [
          { m_ChildRef: "child", m_flDelay: 0.25 },
          { m_ChildRef: "child", m_flDelay: 0.75 },
          { m_ChildRef: "disabled", m_bDisableChild: true },
        ],
      },
      [file("child"), file("child"), file("disabled")],
    ),
  );
  expect(compiled.children.map((child) => child.lifecycle.delay)).toEqual([
    0.25, 0.75,
  ]);
});

test("ambient replay restarts the whole hierarchy after delayed children finish", () => {
  const hierarchy = new ParticleHierarchy(
    compileSystem(
      file(
        "root",
        {
          m_flConstantLifespan: 0.125,
          m_Operators: [{ _class: "C_OP_Decay" }],
          m_Children: [{ m_ChildRef: "child", m_flDelay: 1 }],
        },
        [
          file("child", {
            m_flConstantLifespan: 0.125,
            m_Operators: [{ _class: "C_OP_Decay" }],
          }),
        ],
      ),
    ),
    { autoReplay: true },
  );
  for (let frame = 0; frame < 7; frame += 1) hierarchy.update(0.125);
  expect(hierarchy.age).toBe(0.875);
  expect(hierarchy.nodes[0].system.age).toBe(0.875);
  hierarchy.update(0.125);
  expect(hierarchy.nodes[1].system.count).toBe(1);
  for (let frame = 0; frame < 6; frame += 1) hierarchy.update(0.125);
  expect(hierarchy.age).toBe(0);
  expect(hierarchy.nodes[1].state).toBe("waiting");
  hierarchy.update(0.125);
  expect(hierarchy.nodes[0].system.spawned).toBe(1);
  expect(hierarchy.nodes[1].system.spawned).toBe(0);
});
