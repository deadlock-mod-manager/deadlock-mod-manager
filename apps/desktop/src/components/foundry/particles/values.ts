/* oxlint-disable anti-slop/no-runtime-typeof -- This boundary interprets the recursive, typed KV3 value representation. */
import { Quaternion, Vector3, MathUtils } from "three";
import type { ParticleValue } from "@/types/generated/ParticleValue";

export type Fields = { [key: string]: ParticleValue | undefined };
export const fields = (v: ParticleValue | undefined): Fields =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? v : {};
export const list = (v: ParticleValue | undefined): ParticleValue[] =>
  Array.isArray(v) ? v : [];
export const num = (v: ParticleValue | undefined, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
export const str = (v: ParticleValue | undefined, fallback = ""): string =>
  typeof v === "string" ? v : fallback;
export const bool = (v: ParticleValue | undefined, fallback = false): boolean =>
  typeof v === "boolean" ? v : fallback;
export const vec = (v: ParticleValue | undefined, fallback = 0): Vector3 => {
  const a = list(v);
  return new Vector3(
    num(a[0], fallback),
    num(a[1], fallback),
    num(a[2], fallback),
  );
};
export const clamp = MathUtils.clamp;
export interface ControlPoint {
  position: Vector3;
  rotation: Quaternion;
  previous: Vector3;
}
export interface SurfacePoint {
  position: Vector3;
  normal: Vector3;
  previous: Vector3;
  read: () => Vector3;
}
export class Particle {
  surface: SurfacePoint | null = null;
  readonly values = new Float32Array(48);
  readonly initial = new Float32Array(48);
  readonly vectors = new Map<number, Vector3>();
  readonly initialVectors = new Map<number, Vector3>();
  readonly randomValues = new Map<Fields, number>();
  readonly velocity = new Vector3();
  age = 0;
  index = 0;
  readonly spawnRotation = new Quaternion();
  pathT = 0;
  lockCP = 0;
  readonly spawnCP = new Vector3();
  constructor(
    readonly id: number,
    age: number,
    color: Vector3,
    radius: number,
    life: number,
  ) {
    this.values[1] = life;
    this.values[3] = radius;
    this.values[7] = 1;
    this.values[16] = 1;
    this.values[8] = age;
    this.values[10] = 0.1;
    this.values[11] = id;
    this.values[34] = 1;
    this.vector(6).copy(color);
    this.vector(21).set(0, 0, 1);
  }
  vector(field: number): Vector3 {
    let v = this.vectors.get(field);
    if (!v) {
      v = new Vector3();
      this.vectors.set(field, v);
    }
    return v;
  }
  snapshot() {
    this.initial.set(this.values);
    for (const [field, value] of this.vectors)
      this.initialVectors.set(field, value.clone());
  }
}
export interface Inputs {
  surface?: () => SurfacePoint | null;
  age: number;
  count: number;
  particle?: Particle;
  controls: Map<number, ControlPoint>;
  random: () => number;
  unsupported: Set<string>;
}
export const cp = (ctx: Inputs, index = 0): ControlPoint => {
  let point = ctx.controls.get(index);
  if (!point) {
    point = {
      position: new Vector3(),
      previous: new Vector3(),
      rotation: new Quaternion(),
    };
    ctx.controls.set(index, point);
  }
  return point;
};
export const transform = (
  value: ParticleValue | undefined,
  ctx: Inputs,
): ControlPoint => {
  const data = fields(value);
  if (str(data.m_nType) === "PT_TYPE_INVALID")
    return {
      position: new Vector3(),
      previous: new Vector3(),
      rotation: new Quaternion(),
    };
  const point = cp(ctx, num(data.m_nControlPoint));
  return bool(data.m_bUseOrientation, true)
    ? point
    : { ...point, rotation: new Quaternion() };
};
export const randomVector = (
  min: Vector3,
  max: Vector3,
  random: () => number,
) =>
  new Vector3(
    MathUtils.lerp(min.x, max.x, random()),
    MathUtils.lerp(min.y, max.y, random()),
    MathUtils.lerp(min.z, max.z, random()),
  );
export const bias = (x: number, amount: number) =>
  amount > 0 && amount < 1 ? x / ((1 / amount - 2) * (1 - x) + 1) : x;

export function curve(value: ParticleValue | undefined, input: number): number {
  const points = list(fields(value).m_spline).map(fields);
  if (!points.length) return input;
  if (input <= num(points[0].x)) return num(points[0].y);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      width = num(b.x) - num(a.x);
    if (input > num(b.x) || width <= 0) continue;
    const t = (input - num(a.x)) / width,
      t2 = t * t,
      t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * num(a.y) +
      (t3 - 2 * t2 + t) * num(a.m_flSlopeOutgoing) * width +
      (-2 * t3 + 3 * t2) * num(b.y) +
      (t3 - t2) * num(b.m_flSlopeIncoming) * width
    );
  }
  return num(points[points.length - 1].y);
}

export function scalar(
  value: ParticleValue | undefined,
  ctx: Inputs,
  fallback = 0,
): number {
  if (typeof value === "number") return value;
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return fallback;
  const v = value;
  const p = ctx.particle,
    type = str(v.m_nType, "PF_TYPE_LITERAL");
  let out: number;
  switch (type) {
    case "PF_TYPE_LITERAL":
      out = num(v.m_flLiteralValue, fallback);
      break;
    case "PF_TYPE_RANDOM_UNIFORM":
    case "PF_TYPE_RANDOM_BIASED": {
      let seed = p?.randomValues.get(v);
      if (
        seed === undefined ||
        str(v.m_nRandomMode) === "PF_RANDOM_MODE_VARYING"
      ) {
        seed = ctx.random();
        p?.randomValues.set(v, seed);
      }
      out = MathUtils.lerp(
        num(v.m_flRandomMin),
        num(v.m_flRandomMax, 1),
        type.endsWith("BIASED")
          ? bias(seed, num(v.m_flBiasParameter, 0.5))
          : seed,
      );
      break;
    }
    case "PF_TYPE_PARTICLE_AGE_NORMALIZED":
      out = p ? p.age / Math.max(p.values[1], 0.0001) : 0;
      break;
    case "PF_TYPE_PARTICLE_AGE":
      out = p?.age ?? 0;
      break;
    case "PF_TYPE_COLLECTION_AGE":
      out = ctx.age;
      break;
    case "PF_TYPE_PARTICLE_NUMBER_NORMALIZED":
      out = (p?.index ?? 0) / Math.max(1, ctx.count - 1);
      break;
    case "PF_TYPE_PARTICLE_NUMBER":
      out = p?.id ?? 0;
      break;
    case "PF_TYPE_PARTICLE_FLOAT":
      out = p?.values[num(v.m_nScalarAttribute, 3)] ?? 0;
      break;
    case "PF_TYPE_CONTROL_POINT_COMPONENT":
      out = cp(ctx, num(v.m_nControlPoint)).position.getComponent(
        num(v.m_nVectorComponent),
      );
      break;
    case "PF_TYPE_PARTICLE_NOISE": {
      const pos = p?.vector(0) ?? new Vector3();
      out = noise(
        pos.x * num(v.m_flNoiseScale, 0.1) + ctx.age,
        pos.y * num(v.m_flNoiseScale, 0.1),
        pos.z * num(v.m_flNoiseScale, 0.1) + (p?.id ?? 0),
      );
      out = MathUtils.lerp(
        num(v.m_flNoiseOutputMin),
        num(v.m_flNoiseOutputMax, 1),
        out * 0.5 + 0.5,
      );
      break;
    }
    default:
      ctx.unsupported.add(type);
      return fallback;
  }
  const mode = str(v.m_nInputMode),
    map = str(v.m_nMapType);
  let t =
    (out - num(v.m_flInput0)) / (num(v.m_flInput1, 1) - num(v.m_flInput0) || 1);
  if (mode === "PF_INPUT_MODE_LOOPED") t = ((t % 1) + 1) % 1;
  else t = clamp(t, 0, 1);
  if (map === "PF_MAP_TYPE_MULT") out *= num(v.m_flMultFactor, 1);
  else if (map === "PF_MAP_TYPE_REMAP")
    out = MathUtils.lerp(num(v.m_flOutput0), num(v.m_flOutput1, 1), t);
  else if (map === "PF_MAP_TYPE_CURVE") out = curve(v.m_Curve, t);
  return Number.isFinite(out) ? out : fallback;
}
export function vector(
  value: ParticleValue | undefined,
  ctx: Inputs,
  fallback = 0,
): Vector3 {
  if (Array.isArray(value)) return vec(value, fallback);
  const v = fields(value);
  const type = str(v.m_nType, "PVEC_TYPE_LITERAL");
  switch (type) {
    case "PVEC_TYPE_LITERAL":
      return vec(v.m_vLiteralValue, fallback);
    case "PVEC_TYPE_LITERAL_COLOR":
      return vec(v.m_LiteralColor, 255).multiplyScalar(1 / 255);
    case "PVEC_TYPE_FLOAT_COMPONENTS":
      return new Vector3(
        scalar(v.m_FloatComponentX, ctx),
        scalar(v.m_FloatComponentY, ctx),
        scalar(v.m_FloatComponentZ, ctx),
      );
    case "PVEC_TYPE_PARTICLE_VECTOR":
      return (
        ctx.particle?.vector(num(v.m_nVectorAttribute, 6)).clone() ??
        new Vector3()
      );
    case "PVEC_TYPE_CP_RELATIVE_POSITION":
      return cp(ctx, num(v.m_nControlPoint))
        .position.clone()
        .add(vec(v.m_vCPRelativePosition));
    case "PVEC_TYPE_CP_RELATIVE_DIR":
      return vec(v.m_vCPRelativeDir, 1).applyQuaternion(
        cp(ctx, num(v.m_nControlPoint)).rotation,
      );
    case "PVEC_TYPE_RANDOM_UNIFORM_OFFSET":
      return randomVector(vec(v.m_vRandomMin), vec(v.m_vRandomMax), ctx.random);
    case "PVEC_TYPE_FLOAT_INTERP_GRADIENT": {
      const t = scalar(v.m_FloatInterp, ctx),
        stops = list(fields(v.m_Gradient).m_Stops).map(fields);
      if (!stops.length) return new Vector3(1, 1, 1);
      let a = stops[0];
      for (const b of stops) {
        if (t <= num(b.m_flPosition)) {
          const f = clamp(
            (t - num(a.m_flPosition)) /
              (num(b.m_flPosition) - num(a.m_flPosition) || 1),
            0,
            1,
          );
          return vec(a.m_Color)
            .lerp(vec(b.m_Color), f)
            .multiplyScalar(1 / 255);
        }
        a = b;
      }
      return vec(a.m_Color).multiplyScalar(1 / 255);
    }
    default:
      ctx.unsupported.add(type);
      return new Vector3();
  }
}
// Gradient noise, continuous across lattice boundaries.
const latticeHash = (a: number, b: number, c: number) => {
  let n =
    Math.imul(a, 374761393) ^
    Math.imul(b, 668265263) ^
    Math.imul(c, 2147483647);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
};

const fadeNoise = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
export function noise(x: number, y: number, z: number): number {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    iz = Math.floor(z),
    fx = x - ix,
    fy = y - iy,
    fz = z - iz;
  let result = 0;
  for (let a = 0; a < 2; a++)
    for (let b = 0; b < 2; b++)
      for (let c = 0; c < 2; c++) {
        const h = latticeHash(ix + a, iy + b, iz + c),
          dx = fx - a,
          dy = fy - b,
          dz = fz - c;
        const dot =
          (h & 1 ? dx : -dx) + (h & 2 ? dy : -dy) + (h & 4 ? dz : -dz);
        result +=
          dot *
          (a ? fadeNoise(fx) : 1 - fadeNoise(fx)) *
          (b ? fadeNoise(fy) : 1 - fadeNoise(fy)) *
          (c ? fadeNoise(fz) : 1 - fadeNoise(fz));
      }
  return result;
}
export function setScalar(
  p: Particle,
  field: number,
  value: number,
  method: string,
  dt = 0,
) {
  if (field === 4 || field === 5 || field === 12 || field === 20) {
    if (!method.includes("SCALE")) value *= Math.PI / 180;
  }
  const old = p.values[field];
  switch (method) {
    case "PARTICLE_SET_SCALE_INITIAL_VALUE":
      value *= p.initial[field];
      break;
    case "PARTICLE_SET_ADD_TO_INITIAL_VALUE":
      value += p.initial[field];
      break;
    case "PARTICLE_SET_SCALE_CURRENT_VALUE":
      value *= old;
      break;
    case "PARTICLE_SET_ADD_TO_CURRENT_VALUE":
      value += old;
      break;
    case "PARTICLE_SET_RAMP_CURRENT_VALUE":
      value = old + value * dt;
      break;
  }
  p.values[field] = field === 7 || field === 16 ? clamp(value, 0, 1) : value;
}
