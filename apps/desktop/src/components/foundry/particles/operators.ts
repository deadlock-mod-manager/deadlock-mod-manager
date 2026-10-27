import { Euler, MathUtils, Vector3 } from "three";
import {
  bool,
  clamp,
  cp,
  fields,
  num,
  scalar,
  setScalar,
  str,
  transform,
  vec,
  vector,
  noise,
  bias,
  type Fields,
  type Inputs,
  type Particle,
} from "./values";
import { pathPosition, setVector } from "./initializers";

export function enabled(op: Fields, stopped: boolean, age: number) {
  if (bool(op.m_bDisableOperator)) return false;
  const endcap = str(op.m_nOpEndCapState);
  if (endcap === "PARTICLE_ENDCAP_ENDCAP_ON" && !stopped) return false;
  if (endcap === "PARTICLE_ENDCAP_ENDCAP_OFF" && stopped) return false;
  return age >= num(op.m_flOpStartFadeInTime);
}
export function preEmission(op: Fields, ctx: Inputs): boolean {
  const f = (key: string, d = 0) => scalar(op[key], ctx, d);
  switch (str(op["_class"])) {
    case "C_OP_RemapSpeedtoCP": {
      const source = cp(ctx, num(op.m_nInControlPointNumber)),
        speed = source.position.distanceTo(source.previous) * 60;
      const t = clamp(
        (speed - f("m_flInputMin")) /
          (f("m_flInputMax", 128) - f("m_flInputMin") || 1),
        0,
        1,
      );
      cp(ctx, num(op.m_nOutControlPointNumber, 1)).position.setComponent(
        num(op.m_nField),
        MathUtils.lerp(f("m_flOutputMin"), f("m_flOutputMax", 1), t),
      );
      break;
    }
    case "C_OP_SetSingleControlPointPosition": {
      const out = cp(ctx, num(op.m_nCP1, 1)),
        v = vector(op.m_vecCP1Pos, ctx);
      const base = transform(op.m_transformInput, ctx);
      if (!bool(op.m_bSetOnce) || ctx.age === 0)
        out.position.copy(v.applyQuaternion(base.rotation).add(base.position));
      break;
    }
    case "C_OP_DistanceBetweenCPsToCP": {
      const distance = cp(ctx, num(op.m_nStartCP)).position.distanceTo(
        cp(ctx, num(op.m_nEndCP, 1)).position,
      );
      const t = clamp(
        (distance - f("m_flInputMin")) /
          (f("m_flInputMax", 128) - f("m_flInputMin") || 1),
        0,
        1,
      );
      cp(ctx, num(op.m_nOutputCP)).position.setComponent(
        num(op.m_nOutputCPField),
        MathUtils.lerp(f("m_flOutputMin"), f("m_flOutputMax", 1), t),
      );
      break;
    }
    case "C_OP_SetCPOrientationToPointAtCP": {
      const at = cp(ctx, num(op.m_nOutputCP)),
        target = cp(ctx, num(op.m_nInputCP, 1)).position;
      cp(ctx, num(op.m_nOutputCP)).rotation.setFromUnitVectors(
        new Vector3(1, 0, 0),
        target.clone().sub(at.position).normalize(),
      );
      break;
    }
    case "C_OP_SetParentControlPointsToChildCP":
      break;
    case "C_OP_SetControlPointFieldToScalarExpression": {
      const a = f("m_flInput1"),
        b = f("m_flInput2");
      let value = a + b;
      switch (str(op.m_nExpression)) {
        case "SCALAR_EXPRESSION_SUBTRACT":
          value = a - b;
          break;
        case "SCALAR_EXPRESSION_MUL":
        case "SCALAR_EXPRESSION_MULTIPLY":
          value = a * b;
          break;
        case "SCALAR_EXPRESSION_DIVIDE":
          value = b ? a / b : 0;
          break;
        case "SCALAR_EXPRESSION_MIN":
          value = Math.min(a, b);
          break;
        case "SCALAR_EXPRESSION_MAX":
          value = Math.max(a, b);
          break;
      }
      const point = cp(ctx, num(op.m_nOutputCP, 2)),
        field = num(op.m_nOutVectorField);
      if (field >= 0 && field <= 2)
        point.position.setComponent(
          field,
          MathUtils.lerp(
            point.position.getComponent(field),
            value,
            f("m_flInterpolation", 1),
          ),
        );
      break;
    }
    case "C_OP_SetControlPointToVectorExpression":
      cp(ctx, num(op.m_nOutputCP)).position.copy(expression(op, ctx));
      break;
    case "C_OP_StopAfterCPDuration": {
      const duration = cp(ctx, num(op.m_nCP)).position.getComponent(
        num(op.m_nCPField),
      );
      return duration > 0 && ctx.age >= duration;
    }
    default:
      ctx.unsupported.add(str(op["_class"]));
  }
  return false;
}
function expression(op: Fields, ctx: Inputs) {
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
  return a;
}
export function operate(
  op: Fields,
  p: Particle,
  ctx: Inputs,
  dt: number,
  stopped: boolean,
) {
  if (!enabled(op, stopped, ctx.age)) return;
  const name = str(op["_class"]),
    f = (key: string, d = 0) => scalar(op[key], ctx, d),
    norm = p.age / Math.max(0.0001, p.values[1]);
  switch (name) {
    case "C_OP_LockToBone": {
      if (p.surface) {
        const position = p.surface.read();
        p.vector(0).add(position.clone().sub(p.surface.previous));
        p.surface.previous.copy(position);
      }
      break;
    }
    case "C_OP_MovementRotateParticleAroundAxis": {
      const at = transform(op.m_TransformInput, ctx),
        axis = vec(op.m_vecRotAxis);
      if (axis.lengthSq() === 0) axis.z = 1;
      p.vector(0)
        .sub(at.position)
        .applyAxisAngle(
          axis.normalize(),
          ((f("m_flRotRate") * Math.PI) / 180) * dt,
        )
        .add(at.position);
      break;
    }
    case "C_OP_VectorNoise": {
      const position = p.vector(0),
        scale = f("m_flNoiseScale", 0.1),
        low = vector(op.m_vecOutputMin, ctx),
        high = vector(op.m_vecOutputMax, ctx, 1);
      const n = new Vector3(
        noise(
          position.x * scale + ctx.age,
          position.y * scale,
          position.z * scale,
        ),
        noise(
          position.x * scale,
          position.y * scale + ctx.age + 17,
          position.z * scale,
        ),
        noise(
          position.x * scale,
          position.y * scale,
          position.z * scale + ctx.age + 31,
        ),
      )
        .addScalar(1)
        .multiplyScalar(0.5);
      p.vector(num(op.m_nFieldOutput, 17)).copy(
        low.add(high.sub(low).multiply(n)),
      );
      break;
    }
    case "C_OP_BasicMovement": {
      p.vector(2).copy(p.vector(0));
      p.velocity
        .addScaledVector(vec(op.m_Gravity), dt)
        .multiplyScalar(Math.exp(-f("m_fDrag") * dt));
      p.vector(0).addScaledVector(p.velocity, dt);
      break;
    }
    case "C_OP_Decay":
    case "C_OP_EndCapTimedDecay": {
      if (name === "C_OP_EndCapTimedDecay" && !stopped) break;
      if (p.age >= p.values[1]) p.values[7] = 0;
      break;
    }
    case "C_OP_SetFloat": {
      const field = num(op.m_nOutputField, 3),
        old = p.values[field];
      setScalar(p, field, f("m_InputValue"), str(op.m_nSetMethod), dt);
      p.values[field] = MathUtils.lerp(
        old,
        p.values[field],
        clamp(f("m_Lerp", 1), 0, 1),
      );
      break;
    }
    case "C_OP_SetVec":
      setVector(
        p,
        num(op.m_nOutputField, 6),
        vector(op.m_InputValue, ctx),
        str(op.m_nSetMethod),
      );
      break;
    case "C_OP_FadeInSimple":
      p.values[num(op.m_nFieldOutput, 7)] =
        p.initial[num(op.m_nFieldOutput, 7)] *
        clamp(norm / Math.max(0.0001, f("m_flFadeInTime", 0.25)), 0, 1);
      break;
    case "C_OP_FadeOutSimple":
      p.values[num(op.m_nFieldOutput, 7)] =
        p.initial[num(op.m_nFieldOutput, 7)] *
        clamp((1 - norm) / Math.max(0.0001, f("m_flFadeOutTime", 0.25)), 0, 1);
      break;
    case "C_OP_FadeAndKill": {
      const a = f("m_flStartFadeInTime"),
        b = f("m_flEndFadeInTime", 0.5),
        c = f("m_flStartFadeOutTime", 0.5),
        d = f("m_flEndFadeOutTime", 1);
      p.values[7] =
        p.initial[7] *
        clamp((norm - a) / (b - a || 1), 0, 1) *
        clamp((d - norm) / (d - c || 1), 0, 1);
      break;
    }
    case "C_OP_InterpolateRadius": {
      const t = clamp(
        (norm - f("m_flStartTime")) /
          (f("m_flEndTime", 1) - f("m_flStartTime") || 1),
        0,
        1,
      );
      p.values[3] =
        p.initial[3] *
        MathUtils.lerp(
          f("m_flStartScale", 1),
          f("m_flEndScale", 1),
          bias(t, f("m_flBias", 0.5)),
        );
      break;
    }
    case "C_OP_ColorInterpolate": {
      const t = clamp(
        (norm - f("m_flFadeStartTime")) /
          (f("m_flFadeEndTime", 1) - f("m_flFadeStartTime") || 1),
        0,
        1,
      );
      p.vector(6)
        .copy(p.initialVectors.get(6) ?? new Vector3(1, 1, 1))
        .lerp(vec(op.m_ColorFade, 255).multiplyScalar(1 / 255), t);
      break;
    }
    case "C_OP_RampScalarLinearSimple": {
      const time = bool(op.m_bProportionalOp) ? norm : p.age;
      if (time >= f("m_flStartTime") && time <= f("m_flEndTime", 1)) {
        const field = num(op.m_nField, 3);
        p.values[field] += f("m_Rate") * dt;
        if (field === 7 || field === 16)
          p.values[field] = clamp(p.values[field], 0, 1);
      }
      break;
    }
    case "C_OP_SpinUpdate":
      p.values[4] += p.values[5] * dt;
      break;
    case "C_OP_Spin":
      p.values[num(op.m_nSpinAxis, 4)] +=
        ((f("m_nSpinRate", f("m_flSpinRate")) * Math.PI) / 180) * dt;
      break;
    case "C_OP_PositionLock": {
      if (p.age <= dt + 1e-8) break;
      const at = cp(ctx, num(op.m_nControlPointNumber, p.lockCP));
      p.vector(0).add(
        at.position
          .clone()
          .sub(at.previous)
          .multiplyScalar(f("m_flStartTime", 1)),
      );
      break;
    }
    case "C_OP_NormalLock":
    case "C_OP_RemapTransformOrientationToRotations": {
      const at = cp(
        ctx,
        num(
          op.m_nControlPointNumber,
          num(fields(op.m_TransformInput).m_nControlPoint),
        ),
      );
      if (name === "C_OP_NormalLock")
        p.vector(21)
          .copy(p.initialVectors.get(21) ?? new Vector3(0, 0, 1))
          .applyQuaternion(
            at.rotation.clone().multiply(p.spawnRotation.clone().invert()),
          );
      else if (bool(op.m_bWriteNormal))
        p.vector(21).set(1, 0, 0).applyQuaternion(at.rotation);
      else {
        const e = new Euler().setFromQuaternion(at.rotation);
        p.values[4] = e.x;
        p.values[12] = e.y;
        p.values[20] = e.z;
      }
      break;
    }
    case "C_OP_MaintainSequentialPath":
    case "C_OP_LockToSavedSequentialPathV2": {
      const target = pathPosition(op, ctx, p.pathT);
      if (name === "C_OP_LockToSavedSequentialPathV2")
        target.add(p.initialVectors.get(15) ?? new Vector3());
      p.vector(0).lerp(target, f("m_flCohesionStrength", 1));
      break;
    }
    case "C_OP_DistanceToTransform": {
      const distance = p
        .vector(0)
        .distanceTo(transform(op.m_TransformStart, ctx).position);
      const t = clamp(
        (distance - f("m_flInputMin")) /
          (f("m_flInputMax", 128) - f("m_flInputMin") || 1),
        0,
        1,
      );
      setScalar(
        p,
        num(op.m_nFieldOutput, 3),
        MathUtils.lerp(f("m_flOutputMin"), f("m_flOutputMax", 1), t),
        str(op.m_nSetMethod),
      );
      break;
    }
    case "C_OP_PinParticleToCP": {
      const selected = str(op.m_nParticleSelection);
      if (
        (selected === "PARTICLE_SELECTION_NUMBER" &&
          p.id === Math.round(f("m_nParticleNumber"))) ||
        (!selected && p.pathT === 0)
      )
        p.vector(0)
          .copy(cp(ctx, num(op.m_nControlPointNumber)).position)
          .add(vector(op.m_vecOffset, ctx));
      break;
    }
    case "C_OP_OscillateVector": {
      const rate = vec(op.m_RateMin),
        frequency = vec(op.m_FrequencyMin, 1);
      const shift = new Vector3(
        Math.sin(p.age * frequency.x * 2 * Math.PI) * rate.x,
        Math.sin(p.age * frequency.y * 2 * Math.PI) * rate.y,
        Math.sin(p.age * frequency.z * 2 * Math.PI) * rate.z,
      );
      p.vector(num(op.m_nField, 0)).addScaledVector(shift, dt);
      break;
    }
    case "C_OP_SetVectorAttributeToVectorExpression":
      setVector(
        p,
        num(op.m_nOutputField, 17),
        expression(op, ctx),
        str(op.m_nSetMethod),
      );
      break;
    case "C_OP_SetFloatAttributeToVectorExpression": {
      const a = vector(op.m_vInput1, ctx),
        b = vector(op.m_vInput2, ctx);
      p.values[num(op.m_nOutputField, 3)] =
        str(op.m_nExpression) === "VECTOR_FLOAT_EXPRESSION_DISTANCE"
          ? a.distanceTo(b)
          : a.dot(b);
      break;
    }
    case "C_OP_RemapCrossProductOfTwoVectorsToVector":
      p.vector(num(op.m_nFieldOutput, 21)).copy(
        vector(op.m_InputVec1, ctx)
          .cross(vector(op.m_InputVec2, ctx))
          .normalize(),
      );
      break;
    case "C_OP_RemapDirectionToCPToVector": {
      const value = cp(ctx, num(op.m_nCP)).position.clone().sub(p.vector(0));
      if (bool(op.m_bNormalize)) value.normalize();
      p.vector(num(op.m_nFieldOutput, 17)).copy(value);
      break;
    }
    case "C_OP_ClampScalar": {
      const field = num(op.m_nFieldOutput, 3);
      p.values[field] = clamp(
        p.values[field],
        f("m_flOutputMin"),
        f("m_flOutputMax", 1),
      );
      break;
    }
    case "C_OP_AttractToControlPoint": {
      const d = cp(ctx, num(op.m_nControlPointNumber))
          .position.clone()
          .sub(p.vector(0)),
        distance = Math.max(1, d.length());
      p.velocity.addScaledVector(
        d.normalize(),
        f("m_fForceAmount") * Math.pow(distance, -f("m_fFalloffPower")) * dt,
      );
      break;
    }
    case "C_OP_CurlNoiseForce": {
      const at = p.vector(0).clone().multiply(vector(op.m_vecNoiseFreq, ctx)),
        e = 0.01,
        scale = vector(op.m_vecNoiseScale, ctx);
      const n = (x: number, y: number, z: number) => noise(x + ctx.age, y, z);
      const curl = new Vector3(
        n(at.x, at.y + e, at.z) -
          n(at.x, at.y - e, at.z) -
          n(at.x, at.y, at.z + e) +
          n(at.x, at.y, at.z - e),
        n(at.x, at.y, at.z + e) -
          n(at.x, at.y, at.z - e) -
          n(at.x + e, at.y, at.z) +
          n(at.x - e, at.y, at.z),
        n(at.x + e, at.y, at.z) -
          n(at.x - e, at.y, at.z) -
          n(at.x, at.y + e, at.z) +
          n(at.x, at.y - e, at.z),
      );
      p.velocity.addScaledVector(curl.multiply(scale), dt / (2 * e));
      break;
    }
    case "C_OP_LerpEndCapScalar":
      if (stopped)
        p.values[num(op.m_nFieldOutput, 7)] *= Math.max(0, 1 - dt * 5);
      break;
    case "C_OP_SetChildControlPoints":
    case "C_OP_SetParentControlPointsToChildCP":
      break;
    case "C_OP_RopeSpringConstraint":
      break;
    case "C_OP_CalculateVectorAttribute": {
      const first = num(
          op.m_nControlPointInput1,
          num(fields(op.m_nControlPointInput1).m_controlPointNameString),
        ),
        second = num(
          op.m_nControlPointInput2,
          num(fields(op.m_nControlPointInput2).m_controlPointNameString),
        );
      const result = vec(op.m_vStartValue);
      if (first !== -1) {
        result.addScaledVector(
          cp(ctx, first).position,
          f("m_flControlPointScale1", -1),
        );
        result.addScaledVector(
          cp(ctx, second).position,
          f("m_flControlPointScale2"),
        );
      }
      result.addScaledVector(
        p.vector(num(op.m_nFieldInput1)),
        f("m_flInputScale1", 1),
      );
      result.addScaledVector(
        p.vector(num(op.m_nFieldInput2)),
        f("m_flInputScale2"),
      );
      result.multiply(vec(op.m_vFinalOutputScale, 1));
      const field = num(op.m_nFieldOutput, 21);
      if (field === 21) result.normalize();
      p.vector(field).copy(result);
      break;
    }
    default:
      ctx.unsupported.add(name);
  }
}
