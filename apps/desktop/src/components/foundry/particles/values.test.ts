import { describe, expect, it } from "bun:test";
import { Quaternion, Vector3 } from "three";
import { cp, curve, Particle, scalar, vector, type Inputs } from "./values";
const context = (): Inputs => ({
  age: 2,
  count: 10,
  controls: new Map(),
  random: () => 0.25,
  unsupported: new Set(),
});
describe("Source particle inputs", () => {
  it("evaluates literal, remapped control points and lifetime inputs", () => {
    const ctx = context();
    cp(ctx, 2).position.set(20, 40, 60);
    expect(
      scalar(
        {
          m_nType: "PF_TYPE_CONTROL_POINT_COMPONENT",
          m_nControlPoint: 2,
          m_nVectorComponent: 1,
          m_nMapType: "PF_MAP_TYPE_MULT",
          m_flMultFactor: 0.5,
        },
        ctx,
      ),
    ).toBe(20);
    ctx.particle = new Particle(3, 0, new Vector3(1, 1, 1), 5, 4);
    ctx.particle.age = 2;
    expect(
      scalar(
        {
          m_nType: "PF_TYPE_PARTICLE_AGE_NORMALIZED",
          m_nMapType: "PF_MAP_TYPE_REMAP",
          m_flOutput0: 10,
          m_flOutput1: 20,
        },
        ctx,
      ),
    ).toBe(15);
  });
  it("uses authored Hermite curves and component vectors", () => {
    const ctx = context();
    const c = {
      m_spline: [
        { x: 0, y: 0, m_flSlopeOutgoing: 0 },
        { x: 1, y: 1, m_flSlopeIncoming: 0 },
      ],
    };
    expect(curve(c, 0.5)).toBeCloseTo(0.5);
    expect(curve(c, -1)).toBe(0);
    expect(curve(c, 2)).toBe(1);
    expect(
      vector(
        {
          m_nType: "PVEC_TYPE_FLOAT_COMPONENTS",
          m_FloatComponentX: { m_flLiteralValue: 2 },
          m_FloatComponentY: { m_nType: "PF_TYPE_COLLECTION_AGE" },
        },
        ctx,
      ).toArray(),
    ).toEqual([2, 2, 0]);
  });
  it("keeps per-particle random values stable while varying inputs advance", () => {
    const ctx = context();
    let draws = 0;
    ctx.random = () => ++draws * 0.1;
    ctx.particle = new Particle(1, 0, new Vector3(), 1, 1);
    const input = {
      m_nType: "PF_TYPE_RANDOM_UNIFORM",
      m_flRandomMin: 0,
      m_flRandomMax: 10,
    };
    const a = scalar(input, ctx);
    ctx.age += 0.1;
    expect(scalar(input, ctx)).toBe(a);
    expect(
      scalar({ ...input, m_nRandomMode: "PF_RANDOM_MODE_VARYING" }, ctx),
    ).not.toBe(a);
  });
  it("reports unsupported inputs without introducing nonfinite positions", () => {
    const ctx = context();
    expect(scalar({ m_nType: "PF_TYPE_FUTURE" }, ctx, 7)).toBe(7);
    expect(ctx.unsupported.has("PF_TYPE_FUTURE")).toBe(true);
    cp(ctx).rotation.copy(new Quaternion());
  });
});
