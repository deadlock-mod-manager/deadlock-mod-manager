import { expect, test } from "bun:test";
import {
  type InputContext,
  parseFloatInput,
  parseVectorInput,
  unsupportedInputTypes,
} from "./inputs";

const context: InputContext = {
  age: 1,
  lifetime: 4,
  collectionAge: 2,
  index: 0,
  count: 1,
  seed: 0.25,
  scalar: () => 3,
  controlPoint: () => [1, 2, 3],
};

test("recompiling identical random inputs is deterministic regardless of other compilations", () => {
  const value = {
    m_nType: "PF_TYPE_RANDOM_UNIFORM",
    m_flRandomMin: 1,
    m_flRandomMax: 10,
  };
  const first = parseFloatInput(value, 0).evaluate(context);
  parseFloatInput({ m_nType: "PF_TYPE_RANDOM_UNIFORM" }, 0);
  expect(parseFloatInput(value, 0).evaluate(context)).toBe(first);
  expect(first).toBeGreaterThanOrEqual(1);
  expect(first).toBeLessThan(10);
});

test("random vector components stay in their authored range", () => {
  const input = parseVectorInput(
    {
      m_nType: "PVEC_TYPE_RANDOM_UNIFORM",
      m_vRandomMin: [1, 2, 3],
      m_vRandomMax: [2, 3, 4],
    },
    [0, 0, 0],
  );
  const out: [number, number, number] = [0, 0, 0];
  input.evaluate(context, out);
  expect(input.supported).toBe(true);
  out.forEach((value, axis) => {
    expect(value).toBeGreaterThanOrEqual(axis + 1);
    expect(value).toBeLessThan(axis + 2);
  });
});

test("float-to-vector interpolation respects its input range", () => {
  const input = parseVectorInput(
    {
      m_nType: "PVEC_TYPE_FLOAT_INTERP",
      m_FloatInterp: 15,
      m_flInterpInput0: 10,
      m_flInterpInput1: 20,
      m_vInterpOutput0: [0, 10, 20],
      m_vInterpOutput1: [10, 20, 30],
    },
    [0, 0, 0],
  );
  const out: [number, number, number] = [0, 0, 0];
  input.evaluate(context, out);
  expect(out).toEqual([5, 15, 25]);
});

test("unsupported maps and nested gradient inputs are not marked supported", () => {
  expect(
    parseFloatInput({ m_nMapType: "PF_MAP_NOT_SUPPORTED" }, 0).supported,
  ).toBe(false);
  const value = {
    m_nType: "PVEC_TYPE_FLOAT_INTERP_GRADIENT",
    m_FloatInterp: { m_nType: "PF_TYPE_NOT_SUPPORTED" },
  };
  expect(parseVectorInput(value, [0, 0, 0]).supported).toBe(false);
  expect(unsupportedInputTypes(value)).toEqual(["PF_TYPE_NOT_SUPPORTED"]);
});

test("curve points are evaluated in authored coordinate order", () => {
  const input = parseFloatInput(
    {
      m_flLiteralValue: 0.5,
      m_nMapType: "PF_MAP_TYPE_CURVE",
      m_Curve: {
        m_spline: [
          { x: 1, y: 10 },
          { x: 0, y: 0 },
        ],
      },
    },
    0,
  );
  expect(input.evaluate(context)).toBe(5);
});

test("control point component indices select an integer axis", () => {
  const input = parseFloatInput(
    { m_nType: "PF_TYPE_CONTROL_POINT_COMPONENT", m_nVectorComponent: 1.5 },
    0,
  );
  expect(input.evaluate(context)).toBe(2);
});

test("unsupported map diagnostics include inputs with the default literal type", () => {
  expect(unsupportedInputTypes({ m_nMapType: "PF_MAP_NOT_SUPPORTED" })).toEqual(
    ["PF_MAP_NOT_SUPPORTED"],
  );
});

test("unsupported input scans stop at a finite node budget", () => {
  const entries = Array.from({ length: 10000 }, () => 0);
  expect(
    unsupportedInputTypes({
      entries,
      trailing: { m_nType: "PF_TYPE_NOT_SUPPORTED" },
    }),
  ).toEqual(["input-scan-limit"]);
});
