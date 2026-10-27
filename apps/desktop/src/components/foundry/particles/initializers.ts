import { Vector3, MathUtils, Euler } from "three";
import {
  bool,
  cp,
  fields,
  num,
  scalar,
  setScalar,
  str,
  transform,
  vec,
  vector,
  randomVector,
  noise,
  type Fields,
  type Inputs,
  type Particle,
} from "./values";

export function pathPosition(op: Fields, ctx: Inputs, t: number): Vector3 {
  const path = fields(op.m_PathParams),
    start = cp(ctx, num(path.m_nStartControlPointNumber))
      .position.clone()
      .add(vec(path.m_vStartPointOffset));
  const end = cp(ctx, num(path.m_nEndControlPointNumber))
    .position.clone()
    .add(vec(path.m_vEndOffset));
  const midIndex = num(path.m_nMidControlPointNumber, -1);
  const mid =
    midIndex >= 0
      ? cp(ctx, midIndex).position.clone()
      : start.clone().lerp(end, num(path.m_flMidPoint, 0.5));
  mid.add(vec(path.m_vMidPointOffset));
  const bulge = num(path.m_flBulge);
  if (bulge) mid.add(new Vector3(0, 0, bulge));
  return start
    .multiplyScalar((1 - t) * (1 - t))
    .addScaledVector(mid, 2 * t * (1 - t))
    .addScaledVector(end, t * t);
}
export function setVector(
  p: Particle,
  field: number,
  value: Vector3,
  method: string,
) {
  const current = p.vector(field),
    initial = p.initialVectors.get(field) ?? current;
  if (method === "PARTICLE_SET_ADD_TO_INITIAL_VALUE") value.add(initial);
  else if (method === "PARTICLE_SET_SCALE_INITIAL_VALUE")
    value.multiply(initial);
  else if (method === "PARTICLE_SET_ADD_TO_CURRENT_VALUE") value.add(current);
  else if (method === "PARTICLE_SET_SCALE_CURRENT_VALUE")
    value.multiply(current);
  current.copy(value);
}
export function initialize(op: Fields, p: Particle, ctx: Inputs) {
  const name = str(op["_class"]),
    f = (key: string, d = 0) => scalar(op[key], ctx, d);
  const point = transform(op.m_TransformInput, ctx);
  switch (name) {
    case "C_INIT_CreateOnModel": {
      p.surface = ctx.surface?.() ?? null;
      if (!p.surface) {
        ctx.unsupported.add("C_INIT_CreateOnModel: no renderable surface");
        break;
      }
      p.vector(0).copy(p.surface.position);
      p.vector(21).copy(p.surface.normal);
      break;
    }
    case "C_INIT_SetVectorAttributeToVectorExpression": {
      const a = vector(op.m_vInput1, ctx),
        b = vector(op.m_vInput2, ctx);
      switch (str(op.m_nExpression)) {
        case "VECTOR_EXPRESSION_CROSSPRODUCT":
          a.cross(b);
          break;
        case "VECTOR_EXPRESSION_SUBTRACT":
          a.sub(b);
          break;
        case "VECTOR_EXPRESSION_MUL":
          a.multiply(b);
          break;
        default:
          a.add(b);
      }
      if (bool(op.m_bNormalizedOutput)) a.normalize();
      p.vector(num(op.m_nOutputField, 17)).copy(a);
      break;
    }
    case "C_INIT_InitFloat":
      setScalar(
        p,
        num(op.m_nOutputField, 3),
        f("m_InputValue"),
        str(op.m_nSetMethod),
      );
      break;
    case "C_INIT_InitVec":
      setVector(
        p,
        num(op.m_nOutputField, 6),
        vector(op.m_InputValue, ctx),
        str(op.m_nSetMethod),
      );
      break;
    case "C_INIT_CreateWithinSphereTransform": {
      const z = ctx.random() * 2 - 1,
        angle = ctx.random() * Math.PI * 2;
      const direction = new Vector3(
        Math.sqrt(1 - z * z) * Math.cos(angle),
        Math.sqrt(1 - z * z) * Math.sin(angle),
        z,
      );
      const radius = MathUtils.lerp(
        f("m_fRadiusMin"),
        f("m_fRadiusMax"),
        Math.cbrt(ctx.random()),
      );
      p.vector(0)
        .copy(direction)
        .multiplyScalar(radius)
        .applyQuaternion(point.rotation)
        .add(point.position);
      p.velocity
        .copy(direction)
        .multiplyScalar(
          MathUtils.lerp(f("m_fSpeedMin"), f("m_fSpeedMax"), ctx.random()),
        )
        .applyQuaternion(point.rotation);
      p.velocity.add(
        randomVector(
          vector(op.m_LocalCoordinateSystemSpeedMin, ctx),
          vector(op.m_LocalCoordinateSystemSpeedMax, ctx),
          ctx.random,
        ).applyQuaternion(point.rotation),
      );
      p.lockCP = num(fields(op.m_TransformInput).m_nControlPoint);
      break;
    }
    case "C_INIT_CreateWithinBox": {
      const at = cp(ctx, num(op.m_nControlPointNumber));
      p.vector(0).copy(
        randomVector(
          vector(op.m_vecMin, ctx),
          vector(op.m_vecMax, ctx),
          ctx.random,
        ),
      );
      if (bool(op.m_bLocalSpace)) p.vector(0).applyQuaternion(at.rotation);
      p.vector(0).add(at.position);
      p.lockCP = num(op.m_nControlPointNumber);
      break;
    }
    case "C_INIT_CreateAlongPath":
    case "C_INIT_CreateSequentialPathV2": {
      const count = Math.max(1, f("m_flNumToAssign", 100));
      p.pathT =
        name === "C_INIT_CreateAlongPath"
          ? ctx.random()
          : (p.id % count) / Math.max(1, count - 1);
      p.vector(0).copy(pathPosition(op, ctx, p.pathT));
      break;
    }
    case "C_INIT_PositionOffset": {
      const offset = randomVector(
        vector(op.m_OffsetMin, ctx),
        vector(op.m_OffsetMax, ctx),
        ctx.random,
      );
      if (bool(op.m_bLocalCoords, true)) offset.applyQuaternion(point.rotation);
      p.vector(0).add(offset);
      break;
    }
    case "C_INIT_RandomColor": {
      const a = vec(op.m_ColorMin, 255).multiplyScalar(1 / 255),
        b = vec(op.m_ColorMax, 255).multiplyScalar(1 / 255);
      p.vector(6).copy(a.lerp(b, ctx.random()));
      break;
    }
    case "C_INIT_RandomSequence":
      p.values[9] = Math.floor(
        MathUtils.lerp(
          num(op.m_nSequenceMin),
          num(op.m_nSequenceMax),
          ctx.random(),
        ),
      );
      break;
    case "C_INIT_RandomYawFlip":
      if (ctx.random() < 0.5) p.values[12] += Math.PI;
      break;
    case "C_INIT_NormalOffset": {
      const offset = randomVector(
        vec(op.m_OffsetMin),
        vec(op.m_OffsetMax),
        ctx.random,
      );
      if (bool(op.m_bLocalCoords))
        offset.applyQuaternion(cp(ctx, num(op.m_nControlPointNumber)).rotation);
      p.vector(21).add(offset);
      if (bool(op.m_bNormalize)) p.vector(21).normalize();
      break;
    }
    case "C_INIT_NormalAlignToCP":
      p.vector(num(op.m_nFieldOutput, 21))
        .set(1, 0, 0)
        .applyQuaternion(cp(ctx, num(op.m_nControlPointNumber)).rotation);
      break;
    case "C_INIT_RemapInitialDirectionToTransformToVector": {
      const direction = point.position.clone().sub(p.vector(0));
      if (bool(op.m_bNormalize, true)) direction.normalize();
      p.vector(num(op.m_nFieldOutput, 21)).copy(direction);
      break;
    }
    case "C_INIT_RemapInitialTransformDirectionToRotation": {
      const e = new Euler().setFromQuaternion(point.rotation, "ZYX");
      p.values[4] = e.x;
      p.values[12] = e.z;
      p.values[20] = e.y;
      break;
    }
    case "C_INIT_RingWave": {
      const angle =
        2 *
        Math.PI *
        (bool(op.m_bEvenDistribution)
          ? p.id / Math.max(1, f("m_flParticlesPerOrbit", 20))
          : ctx.random());
      const direction = new Vector3(
        Math.cos(angle),
        Math.sin(angle),
        0,
      ).applyQuaternion(point.rotation);
      p.vector(0)
        .copy(point.position)
        .addScaledVector(direction, f("m_flInitialRadius"));
      p.velocity
        .copy(direction)
        .multiplyScalar(
          MathUtils.lerp(
            f("m_flInitialSpeedMin"),
            f("m_flInitialSpeedMax"),
            ctx.random(),
          ),
        );
      break;
    }
    case "C_INIT_InitialVelocityNoise": {
      const v = p.vector(0),
        frequency = f("m_flNoiseScaleLoc", 0.01),
        seed = p.id + ctx.age * f("m_flNoiseScale", 1);
      const low = vector(op.m_vecOutputMin, ctx),
        high = vector(op.m_vecOutputMax, ctx);
      const amount = new Vector3(
        noise(v.x * frequency + seed, v.y * frequency, v.z * frequency),
        noise(v.x * frequency, v.y * frequency + seed + 37, v.z * frequency),
        noise(v.x * frequency, v.y * frequency, v.z * frequency + seed + 67),
      )
        .addScalar(1)
        .multiplyScalar(0.5);
      p.velocity.add(low.add(high.sub(low).multiply(amount)));
      break;
    }
    case "C_INIT_InheritVelocity":
      p.velocity.add(
        cp(ctx, num(op.m_nControlPointNumber))
          .position.clone()
          .sub(cp(ctx, num(op.m_nControlPointNumber)).previous)
          .multiplyScalar(f("m_flVelocityScale", 1) * 60),
      );
      break;
    case "C_INIT_DistanceToCPInit": {
      const distance = p
        .vector(0)
        .distanceTo(cp(ctx, num(op.m_nControlPointNumber)).position);
      const t = MathUtils.clamp(
        (distance - f("m_flInputMin")) /
          (f("m_flInputMax", 128) - f("m_flInputMin") || 1),
        0,
        1,
      );
      setScalar(
        p,
        num(op.m_nFieldOutput, 3),
        MathUtils.lerp(f("m_flOutputMin"), f("m_flOutputMax", 1), t),
        bool(op.m_bScaleInitialRange) ? "PARTICLE_SET_SCALE_CURRENT_VALUE" : "",
      );
      break;
    }
    case "C_INIT_CreationNoise":
      p.values[num(op.m_nFieldOutput, 7)] = MathUtils.lerp(
        f("m_flOutputMin"),
        f("m_flOutputMax", 1),
        noise(p.id, ctx.age, 0) * 0.5 + 0.5,
      );
      break;
    default:
      ctx.unsupported.add(name);
  }
}
