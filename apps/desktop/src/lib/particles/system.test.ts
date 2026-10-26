import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { type JsonObject } from "./json";
import { compileSystem, particleSystemDiagnostics } from "./compiler";
import { FIELD } from "./types";
import { ParticleSystem } from "./system";

const points = () => [
  {
    position: new THREE.Vector3(),
    rotation: new THREE.Quaternion(),
    previousPosition: new THREE.Vector3(),
    previousRotation: new THREE.Quaternion(),
  },
];
const systemOf = (definition: JsonObject) =>
  new ParticleSystem(
    compileSystem({
      path: "test.vpcf",
      children: [],
      definition: {
        m_nMaxParticles: 4,
        m_flConstantLifespan: 4,
        m_Emitters: [
          { _class: "C_OP_InstantaneousEmitter", m_nParticlesToEmit: 1 },
        ],
        ...definition,
      },
    }),
    points(),
  );

describe("particle preview simulation", () => {
  test("fade-in uses smoothstep and fade-out preserves a lower alpha", () => {
    const system = systemOf({
      m_Operators: [
        { _class: "C_OP_FadeInSimple", m_flFadeInTime: 0.5 },
        { _class: "C_OP_FadeOutSimple", m_flFadeOutTime: 0.5 },
      ],
    });
    system.update(0.125);
    expect(system.scalar(FIELD.alpha)[0]).toBe(0);
    system.update(0.5);
    expect(system.scalar(FIELD.alpha)[0]).toBeCloseTo(0.15625);
    system.update(0.5);
    expect(system.scalar(FIELD.alpha)[0]).toBeCloseTo(0.5);
    system.update(1.5);
    system.scalar(FIELD.alpha)[0] = 0.01;
    system.update(0.5);
    expect(system.scalar(FIELD.alpha)[0]).toBeCloseTo(0.01);
  });

  test("zero-duration fades do not introduce NaN", () => {
    const system = systemOf({
      m_Operators: [
        { _class: "C_OP_FadeInSimple", m_flFadeInTime: 0 },
        { _class: "C_OP_FadeOutSimple", m_flFadeOutTime: 0 },
      ],
    });
    system.update(0.125);
    system.update(4);
    expect(system.scalar(FIELD.alpha)[0]).toBe(1);
  });

  test("radius scale uses the initial value and supports a descending range", () => {
    const system = systemOf({
      m_flConstantRadius: 8,
      m_Operators: [
        {
          _class: "C_OP_InterpolateRadius",
          m_flStartScale: 2,
          m_flEndScale: 0,
        },
      ],
    });
    system.update(0.125);
    expect(system.scalar(FIELD.radius)[0]).toBe(16);
    system.update(2);
    expect(system.scalar(FIELD.radius)[0]).toBe(8);
    system.update(1);
    expect(system.scalar(FIELD.radius)[0]).toBe(4);
  });

  test("scalar ramps respect their lifetime window and clamp alpha", () => {
    const system = systemOf({
      m_ConstantColor: [255, 255, 255, 128],
      m_Operators: [
        {
          _class: "C_OP_RampScalarLinearSimple",
          m_nField: FIELD.alpha,
          m_Rate: 2,
          m_flStartTime: 0.25,
          m_flEndTime: 0.75,
        },
      ],
    });
    system.update(0.125);
    expect(system.scalar(FIELD.alpha)[0]).toBeCloseTo(128 / 255);
    system.update(1);
    expect(system.scalar(FIELD.alpha)[0]).toBe(1);
    system.scalar(FIELD.alpha)[0] = 0.2;
    system.update(2);
    expect(system.scalar(FIELD.alpha)[0]).toBeCloseTo(0.2);
  });

  test("clamp supports number providers and lets the maximum win an inverted range", () => {
    const system = systemOf({
      m_Operators: [
        {
          _class: "C_OP_ClampScalar",
          m_flOutputMin: 10,
          m_flOutputMax: { m_nType: "PF_TYPE_LITERAL", m_flLiteralValue: 3 },
        },
      ],
    });
    system.update(0.125);
    expect(system.scalar(FIELD.radius)[0]).toBe(3);
  });

  test("color interpolation retains each particle's initial color when a slot is reused", () => {
    const system = systemOf({
      m_ConstantColor: [255, 0, 0, 255],
      m_Operators: [
        {
          _class: "C_OP_ColorInterpolate",
          m_ColorFade: [0, 0, 255],
        },
      ],
    });
    system.update(0.125);
    system.update(2);
    expect(system.vector(FIELD.color)[0]).toBeCloseTo(0.5);
    system.reset();
    system.update(0.125);
    expect(Array.from(system.vector(FIELD.color).slice(0, 3))).toEqual([
      1, 0, 0,
    ]);
    system.update(1);
    expect(system.vector(FIELD.color)[0]).toBeCloseTo(0.75);
  });

  test("disabled and endcap-only operators cannot block or alter a system", () => {
    const system = systemOf({
      m_Initializers: [
        { _class: "C_INIT_CreateOnModel", m_bDisableOperator: true },
      ],
      m_Operators: [
        {
          _class: "C_OP_SetFloat",
          m_nOutputField: FIELD.alpha,
          m_InputValue: 0,
          m_bDisableOperator: true,
        },
        {
          _class: "C_OP_SetFloat",
          m_nOutputField: FIELD.alpha,
          m_InputValue: 0,
          m_nOpEndCapState: "PARTICLE_ENDCAP_ENDCAP_ON",
        },
      ],
    });
    system.update(0.125);
    expect(system.spec.blockedBy).toBeNull();
    expect(system.scalar(FIELD.alpha)[0]).toBe(1);
    expect(system.spec.diagnostics).toEqual([]);
  });

  test("reset reproduces seeded inputs and clears leftover scratch attributes", () => {
    const system = systemOf({
      m_Initializers: [
        {
          _class: "C_INIT_InitFloat",
          m_nOutputField: FIELD.radius,
          m_InputValue: {
            m_nType: "PF_TYPE_RANDOM_UNIFORM",
            m_flRandomMin: 1,
            m_flRandomMax: 9,
          },
        },
      ],
    });
    system.update(0.125);
    const radius = system.scalar(FIELD.radius)[0];
    system.scalar(18)[0] = 42;
    system.reset();
    system.update(0.125);
    expect(system.scalar(FIELD.radius)[0]).toBe(radius);
    expect(system.scalar(18)[0]).toBe(0);
  });

  test("particle capacity bounds a huge emission and invalid deltas do not advance", () => {
    const system = systemOf({
      m_nMaxParticles: 3,
      m_Emitters: [
        {
          _class: "C_OP_InstantaneousEmitter",
          m_nParticlesToEmit: 1_000_000,
        },
      ],
    });
    system.update(0);
    system.update(Number.NaN);
    expect(system.age).toBe(0);
    system.update(0.125);
    expect(system.count).toBe(3);
  });
});

test("diagnostics identify blocked, omitted, approximated, and unsupported inputs in children", () => {
  const system = compileSystem({
    path: "root",
    definition: {},
    children: [
      {
        path: "child",
        children: [],
        definition: {
          m_Initializers: [
            { _class: "C_INIT_InitSkinnedPositionFromCPSnapshot" },
          ],
          m_Operators: [
            { _class: "C_OP_Unimplemented" },
            {
              _class: "C_OP_SetFloat",
              m_InputValue: { m_nType: "PF_TYPE_NOT_SUPPORTED" },
            },
          ],
          m_Constraints: [{ _class: "C_OP_ConstrainDistance" }],
          m_Renderers: [{ _class: "C_OP_RenderTrails" }],
        },
      },
    ],
  });
  expect(
    particleSystemDiagnostics([system]).map(({ code, className }) => [
      code,
      className,
    ]),
  ).toEqual([
    ["blocked", "C_INIT_InitSkinnedPositionFromCPSnapshot"],
    ["unsupported-input", "C_OP_SetFloat"],
    ["unsupported", "C_OP_Unimplemented"],
    ["unsupported", "C_OP_ConstrainDistance"],
    ["approximation", "C_OP_RenderTrails"],
  ]);
});

test("a delayed burst fires once at an exact frame boundary and is not restarted while waiting", () => {
  const system = systemOf({
    m_Emitters: [
      {
        _class: "C_OP_InstantaneousEmitter",
        m_flStartTime: 2,
        m_nParticlesToEmit: 1,
      },
    ],
  });
  for (let frame = 0; frame < 8; frame += 1) system.update(0.25);
  expect(system.count).toBe(1);
  expect(system.age).toBe(2);
  system.update(0.25);
  expect(system.count).toBe(1);
});

test("continuous emission clips frames to the authored start and duration", () => {
  const system = systemOf({
    m_Emitters: [
      {
        _class: "C_OP_ContinuousEmitter",
        m_flStartTime: 0.5,
        m_flEmissionDuration: 0.5,
        m_flEmitRate: 8,
      },
    ],
  });
  system.update(0.75);
  expect(system.count).toBe(2);
  system.update(0.5);
  expect(system.count).toBe(4);
});

test("reused slots clear custom attributes and scale fresh initial values", () => {
  const system = systemOf({
    m_nMaxParticles: 1,
    m_flConstantLifespan: 0.1,
    m_flConstantRadius: 8,
    m_Emitters: [{ _class: "C_OP_ContinuousEmitter", m_flEmitRate: 4 }],
    m_Initializers: [
      {
        _class: "C_INIT_InitFloat",
        m_nOutputField: FIELD.radius,
        m_nSetMethod: "PARTICLE_SET_SCALE_INITIAL_VALUE",
        m_InputValue: 2,
      },
    ],
    m_Operators: [{ _class: "C_OP_Decay" }],
  });
  system.update(0.25);
  expect(system.scalar(FIELD.radius)[0]).toBe(16);
  system.scalar(18)[0] = 42;
  system.vector(FIELD.normal).fill(9);
  system.update(0.25);
  expect(system.count).toBe(0);
  system.update(0.25);
  expect(system.count).toBe(1);
  expect(system.scalar(FIELD.radius)[0]).toBe(16);
  expect(system.scalar(18)[0]).toBe(0);
  expect(Array.from(system.vector(FIELD.normal).slice(0, 3))).toEqual([
    0, 0, 0,
  ]);
});

test("force scratch values cannot overwrite gravity for later particles", () => {
  const system = systemOf({
    m_Emitters: [
      { _class: "C_OP_InstantaneousEmitter", m_nParticlesToEmit: 2 },
    ],
    m_Operators: [{ _class: "C_OP_BasicMovement", m_Gravity: [0, 0, -10] }],
    m_ForceGenerators: [
      { _class: "C_OP_CurlNoiseForce", m_vecNoiseScale: [0, 0, 0] },
    ],
  });
  system.update(0.1);
  expect(Array.from(system.velocity.slice(0, 6))).toEqual([0, 0, -1, 0, 0, -1]);
});

test("one-shot replay waits for all delayed emitters", () => {
  const system = systemOf({
    m_flConstantLifespan: 0.1,
    m_Emitters: [
      {
        _class: "C_OP_InstantaneousEmitter",
        m_flStartTime: 0,
        m_nParticlesToEmit: 1,
      },
      {
        _class: "C_OP_InstantaneousEmitter",
        m_flStartTime: 2,
        m_nParticlesToEmit: 1,
      },
    ],
    m_Operators: [{ _class: "C_OP_Decay" }],
  });
  for (let frame = 0; frame < 8; frame += 1) system.update(0.25);
  expect(system.age).toBe(2);
  expect(system.count).toBe(1);
});

test("fractional capacities cannot spawn beyond allocated particle slots", () => {
  const system = systemOf({
    m_nMaxParticles: 1.5,
    m_Emitters: [
      { _class: "C_OP_InstantaneousEmitter", m_nParticlesToEmit: 20 },
    ],
  });
  system.update(0.1);
  expect(system.count).toBe(1);
  expect(system.scalar(FIELD.radius).length).toBe(1);
});

test("operator compilation stops at the shared per-system budget", () => {
  const system = compileSystem({
    path: "bounded",
    children: [],
    definition: {
      m_Operators: Array.from({ length: 10000 }, () => ({
        _class: "C_OP_Unimplemented",
      })),
    },
  });
  expect(
    system.diagnostics.filter((entry) => entry.code === "unsupported"),
  ).toHaveLength(128);
  expect(
    system.diagnostics.some((entry) => entry.detail === "operator-budget"),
  ).toBe(true);
});

test("operators exceeding the input scan budget are reported and omitted", () => {
  const system = compileSystem({
    path: "bounded",
    children: [],
    definition: {
      m_Operators: [
        {
          _class: "C_OP_SetFloat",
          m_InputValue: { entries: Array.from({ length: 10000 }, () => 0) },
        },
      ],
    },
  });
  expect(system.operators).toHaveLength(0);
  expect(system.diagnostics).toEqual([
    {
      path: "bounded",
      stage: "operator",
      className: "C_OP_SetFloat",
      code: "unsupported-input",
      detail: "input-scan-limit",
    },
  ]);
});
