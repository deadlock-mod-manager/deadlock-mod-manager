import { z } from "zod";
import { type JsonValue, jsonValue } from "./json";

/**
 * Source 2 particle parameters are "inputs": a value source (a literal, a
 * random range, the particle's age, another particle field, ...) optionally
 * mapped through a remap or curve. This file parses them from the decoded
 * definition and evaluates them.
 */

const number = z.number().catch(0);

const curveSchema = z
  .object({
    m_spline: z
      .array(
        z.object({
          x: number.default(0),
          y: number.default(0),
          m_flSlopeIncoming: number.default(0),
          m_flSlopeOutgoing: number.default(0),
        }),
      )
      .catch([]),
  })
  .catch({ m_spline: [] });

const floatInputSchema = z.object({
  m_nType: z.string().default("PF_TYPE_LITERAL"),
  m_flLiteralValue: number.default(0),
  m_flRandomMin: number.default(0),
  m_flRandomMax: number.default(1),
  m_flBiasParameter: number.default(0),
  m_bHasRandomSignFlip: z.boolean().catch(false).default(false),
  m_nMapType: z.string().default("PF_MAP_TYPE_DIRECT"),
  m_flMultFactor: number.default(1),
  m_flInput0: number.default(0),
  m_flInput1: number.default(1),
  m_flOutput0: number.default(0),
  m_flOutput1: number.default(1),
  m_nInputMode: z.string().default("PF_INPUT_MODE_CLAMPED"),
  m_nScalarAttribute: number.default(3),
  m_nControlPoint: number.default(0),
  m_nVectorComponent: number.default(0),
  m_Curve: curveSchema.default({ m_spline: [] }),
});

type FloatInputData = z.infer<typeof floatInputSchema>;

/** What an input may read while being evaluated for one particle. */
export interface InputContext {
  /** Seconds since the particle spawned. */
  age: number;
  lifetime: number;
  /** Seconds since the system started. */
  collectionAge: number;
  index: number;
  count: number;
  /** A per-particle constant in [0, 1) so "random" stays put for its life. */
  seed: number;
  scalar: (field: number) => number;
  controlPoint: (index: number) => [number, number, number];
}

export interface FloatInput {
  evaluate(context: InputContext): number;
  supported: boolean;
}

const SUPPORTED_FLOAT_TYPES = new Set([
  "PF_TYPE_LITERAL",
  "PF_TYPE_RANDOM_UNIFORM",
  "PF_TYPE_RANDOM_BIASED",
  "PF_TYPE_PARTICLE_AGE",
  "PF_TYPE_PARTICLE_AGE_NORMALIZED",
  "PF_TYPE_COLLECTION_AGE",
  "PF_TYPE_PARTICLE_NUMBER",
  "PF_TYPE_PARTICLE_NUMBER_NORMALIZED",
  "PF_TYPE_PARTICLE_FLOAT",
  "PF_TYPE_CONTROL_POINT_COMPONENT",
  "PF_TYPE_PARTICLE_NOISE",
]);

/** Cheap deterministic hash so each input draws its own random per particle. */
export const hash01 = (seed: number, salt: number) => {
  const value = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
};

/** Schlick's bias curve; `bias` in (-1, 1) leans the result low or high. */
const biased = (t: number, bias: number) => {
  const amount = Math.min(Math.max((bias + 1) / 2, 0.001), 0.999);
  return t / ((1 / amount - 2) * (1 - t) + 1);
};

/** Cubic Hermite through the curve's points using their stored slopes. */
const evaluateCurve = (
  points: FloatInputData["m_Curve"]["m_spline"],
  x: number,
) => {
  if (points.length === 0) return x;
  const first = points[0];
  const last = points[points.length - 1];
  if (x <= first.x) return first.y;
  if (x >= last.x) return last.y;
  for (let index = 1; index < points.length; index += 1) {
    const right = points[index];
    if (x > right.x) continue;
    const left = points[index - 1];
    const span = right.x - left.x || 1;
    const t = (x - left.x) / span;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * left.y +
      (t3 - 2 * t2 + t) * span * left.m_flSlopeOutgoing +
      (-2 * t3 + 3 * t2) * right.y +
      (t3 - t2) * span * right.m_flSlopeIncoming
    );
  }
  return last.y;
};

const inputSalt = (value: JsonValue | undefined) => {
  const text = JSON.stringify(value) ?? "";
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1)
    hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return hash >>> 0;
};

const SUPPORTED_MAP_TYPES = new Set([
  "PF_MAP_TYPE_DIRECT",
  "PF_MAP_TYPE_MULT",
  "PF_MAP_TYPE_REMAP",
  "PF_MAP_TYPE_CURVE",
]);

export const parseFloatInput = (
  value: JsonValue | undefined,
  fallback: number,
): FloatInput => {
  const parsed = floatInputSchema.safeParse(value);
  if (!parsed.success) {
    const literal = z.number().safeParse(value);
    const constant = literal.success ? literal.data : fallback;
    return { evaluate: () => constant, supported: true };
  }
  const input = parsed.data;
  input.m_Curve.m_spline.sort((a, b) => a.x - b.x);
  const salt = inputSalt(value);
  const source = (context: InputContext): number => {
    switch (input.m_nType) {
      case "PF_TYPE_LITERAL":
        return input.m_flLiteralValue;
      case "PF_TYPE_RANDOM_UNIFORM":
        return (
          input.m_flRandomMin +
          (input.m_flRandomMax - input.m_flRandomMin) *
            hash01(context.seed, salt)
        );
      case "PF_TYPE_RANDOM_BIASED":
        return (
          input.m_flRandomMin +
          (input.m_flRandomMax - input.m_flRandomMin) *
            biased(hash01(context.seed, salt), input.m_flBiasParameter)
        );
      case "PF_TYPE_PARTICLE_AGE":
        return context.age;
      case "PF_TYPE_PARTICLE_AGE_NORMALIZED":
        return context.lifetime > 0 ? context.age / context.lifetime : 0;
      case "PF_TYPE_COLLECTION_AGE":
        return context.collectionAge;
      case "PF_TYPE_PARTICLE_NUMBER":
        return context.index;
      case "PF_TYPE_PARTICLE_NUMBER_NORMALIZED":
        return context.count > 1 ? context.index / (context.count - 1) : 0;
      case "PF_TYPE_PARTICLE_FLOAT":
        return context.scalar(input.m_nScalarAttribute);
      case "PF_TYPE_CONTROL_POINT_COMPONENT":
        return context.controlPoint(input.m_nControlPoint)[
          Math.min(Math.max(Math.floor(input.m_nVectorComponent), 0), 2)
        ];
      case "PF_TYPE_PARTICLE_NOISE":
        return hash01(context.seed + Math.floor(context.age * 4), salt);
      default:
        return input.m_flLiteralValue;
    }
  };
  const remap = (raw: number) => {
    switch (input.m_nMapType) {
      case "PF_MAP_TYPE_MULT":
        return raw * input.m_flMultFactor;
      case "PF_MAP_TYPE_REMAP": {
        const span = input.m_flInput1 - input.m_flInput0 || 1;
        let t = (raw - input.m_flInput0) / span;
        if (input.m_nInputMode === "PF_INPUT_MODE_LOOPED") t -= Math.floor(t);
        else t = Math.min(Math.max(t, 0), 1);
        return input.m_flOutput0 + (input.m_flOutput1 - input.m_flOutput0) * t;
      }
      case "PF_MAP_TYPE_CURVE": {
        const points = input.m_Curve.m_spline;
        if (
          input.m_nInputMode === "PF_INPUT_MODE_LOOPED" &&
          points.length > 1
        ) {
          const start = points[0].x;
          const span = points[points.length - 1].x - start || 1;
          const t = (raw - start) / span;
          return evaluateCurve(points, start + (t - Math.floor(t)) * span);
        }
        return evaluateCurve(points, raw);
      }
      default:
        return raw;
    }
  };
  return {
    supported:
      SUPPORTED_FLOAT_TYPES.has(input.m_nType) &&
      SUPPORTED_MAP_TYPES.has(input.m_nMapType),
    evaluate: (context) => {
      const result = remap(source(context));
      return input.m_bHasRandomSignFlip &&
        hash01(context.seed, salt + 0.5) < 0.5
        ? -result
        : result;
    },
  };
};

const vectorInputSchema = z.object({
  m_nType: z.string().default("PVEC_TYPE_LITERAL"),
  m_vLiteralValue: z.array(number).catch([0, 0, 0]).default([0, 0, 0]),
  m_LiteralColor: z.array(number).catch([0, 0, 0]).default([0, 0, 0]),
  m_nControlPoint: number.default(0),
  m_vRandomMin: z.array(number).catch([0, 0, 0]).default([0, 0, 0]),
  m_vRandomMax: z.array(number).catch([1, 1, 1]).default([1, 1, 1]),
  m_vInterpOutput0: z.array(number).catch([0, 0, 0]).default([0, 0, 0]),
  m_vInterpOutput1: z.array(number).catch([1, 1, 1]).default([1, 1, 1]),
  m_flInterpInput0: number.default(0),
  m_flInterpInput1: number.default(1),
  m_FloatComponentX: jsonValue.optional(),
  m_FloatComponentY: jsonValue.optional(),
  m_FloatComponentZ: jsonValue.optional(),
  m_FloatInterp: jsonValue.optional(),
  m_Gradient: z
    .object({
      m_Stops: z
        .array(
          z.object({
            m_flPosition: number.default(0),
            m_Color: z.array(number).catch([255, 255, 255, 255]),
          }),
        )
        .catch([]),
    })
    .catch({ m_Stops: [] })
    .default({ m_Stops: [] }),
});

export interface VectorInput {
  evaluate(context: InputContext, out: [number, number, number]): void;
  supported: boolean;
}

const SUPPORTED_VECTOR_TYPES = new Set([
  "PVEC_TYPE_LITERAL",
  "PVEC_TYPE_RANDOM_UNIFORM",
  "PVEC_TYPE_FLOAT_INTERP",
  "PVEC_TYPE_LITERAL_COLOR",
  "PVEC_TYPE_FLOAT_COMPONENTS",
  "PVEC_TYPE_FLOAT_INTERP_GRADIENT",
  "PVEC_TYPE_CP_VALUE",
]);

export const parseVectorInput = (
  value: JsonValue | undefined,
  fallback: [number, number, number],
): VectorInput => {
  const literalArray = z.array(z.number()).min(3).safeParse(value);
  if (literalArray.success) {
    const [x, y, depth] = literalArray.data;
    return {
      supported: true,
      evaluate: (_, out) => {
        out[0] = x;
        out[1] = y;
        out[2] = depth;
      },
    };
  }
  const parsed = vectorInputSchema.safeParse(value);
  if (!parsed.success) {
    return {
      supported: true,
      evaluate: (_, out) => {
        [out[0], out[1], out[2]] = fallback;
      },
    };
  }
  const input = parsed.data;
  const salt = inputSalt(value);
  const componentX = parseFloatInput(input.m_FloatComponentX, 0);
  const componentY = parseFloatInput(input.m_FloatComponentY, 0);
  const componentZ = parseFloatInput(input.m_FloatComponentZ, 0);
  const interp = parseFloatInput(input.m_FloatInterp, 0);
  const stops = [...input.m_Gradient.m_Stops].sort(
    (a, b) => a.m_flPosition - b.m_flPosition,
  );
  return {
    supported:
      SUPPORTED_VECTOR_TYPES.has(input.m_nType) &&
      (input.m_nType !== "PVEC_TYPE_FLOAT_COMPONENTS" ||
        (componentX.supported &&
          componentY.supported &&
          componentZ.supported)) &&
      (!input.m_nType.startsWith("PVEC_TYPE_FLOAT_INTERP") || interp.supported),
    evaluate: (context, out) => {
      switch (input.m_nType) {
        case "PVEC_TYPE_RANDOM_UNIFORM":
          for (let axis = 0; axis < 3; axis += 1) {
            const low = input.m_vRandomMin[axis] ?? 0;
            out[axis] =
              low +
              ((input.m_vRandomMax[axis] ?? 1) - low) *
                hash01(context.seed, salt + axis);
          }
          return;
        case "PVEC_TYPE_FLOAT_INTERP": {
          const span = input.m_flInterpInput1 - input.m_flInterpInput0;
          const amount = Math.min(
            Math.max(
              (interp.evaluate(context) - input.m_flInterpInput0) / (span || 1),
              0,
            ),
            1,
          );
          for (let axis = 0; axis < 3; axis += 1) {
            const low = input.m_vInterpOutput0[axis] ?? 0;
            out[axis] =
              low + ((input.m_vInterpOutput1[axis] ?? 1) - low) * amount;
          }
          return;
        }
        case "PVEC_TYPE_LITERAL_COLOR":
          out[0] = (input.m_LiteralColor[0] ?? 0) / 255;
          out[1] = (input.m_LiteralColor[1] ?? 0) / 255;
          out[2] = (input.m_LiteralColor[2] ?? 0) / 255;
          return;
        case "PVEC_TYPE_FLOAT_COMPONENTS":
          out[0] = componentX.evaluate(context);
          out[1] = componentY.evaluate(context);
          out[2] = componentZ.evaluate(context);
          return;
        case "PVEC_TYPE_FLOAT_INTERP_GRADIENT": {
          const t = interp.evaluate(context);
          const upper = stops.findIndex((stop) => stop.m_flPosition >= t);
          const right = stops[upper === -1 ? stops.length - 1 : upper];
          const left =
            stops[Math.max((upper === -1 ? stops.length : upper) - 1, 0)];
          if (!left || !right) {
            out[0] = out[1] = out[2] = 1;
            return;
          }
          const span = right.m_flPosition - left.m_flPosition;
          const amount =
            span > 0
              ? Math.min(Math.max((t - left.m_flPosition) / span, 0), 1)
              : 0;
          for (let channel = 0; channel < 3; channel += 1) {
            out[channel] =
              ((left.m_Color[channel] ?? 255) +
                ((right.m_Color[channel] ?? 255) -
                  (left.m_Color[channel] ?? 255)) *
                  amount) /
              255;
          }
          return;
        }
        case "PVEC_TYPE_CP_VALUE":
          [out[0], out[1], out[2]] = context.controlPoint(
            input.m_nControlPoint,
          );
          return;
        default:
          out[0] = input.m_vLiteralValue[0] ?? 0;
          out[1] = input.m_vLiteralValue[1] ?? 0;
          out[2] = input.m_vLiteralValue[2] ?? 0;
      }
    },
  };
};

/** Input type identifiers the evaluator cannot reproduce, including nested inputs. */
export const unsupportedInputTypes = (value: JsonValue): string[] => {
  const issues = new Set<string>();
  let remaining = 512;
  const visit = (value: JsonValue, depth: number): boolean => {
    if (remaining-- <= 0 || depth > 32) {
      issues.add("input-scan-limit");
      return false;
    }
    if (Array.isArray(value)) {
      for (const item of value) if (!visit(item, depth + 1)) return false;
      return true;
    }
    if (!(value instanceof Object)) return true;
    const type = z.string().safeParse(value.m_nType);
    if (type.success) {
      if (
        type.data.startsWith("PF_TYPE_") &&
        !SUPPORTED_FLOAT_TYPES.has(type.data)
      )
        issues.add(type.data);
      if (
        type.data.startsWith("PVEC_TYPE_") &&
        !SUPPORTED_VECTOR_TYPES.has(type.data)
      )
        issues.add(type.data);
    }
    const mapType = z.string().safeParse(value.m_nMapType);
    if (mapType.success && !SUPPORTED_MAP_TYPES.has(mapType.data))
      issues.add(mapType.data);
    for (const key in value) if (!visit(value[key], depth + 1)) return false;
    return true;
  };
  visit(value, 0);
  return [...issues];
};
