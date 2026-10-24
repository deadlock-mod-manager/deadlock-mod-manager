import * as THREE from "three";
import {
  numberOf,
  stringOf,
  numbersOf,
  classOf,
  booleanOf,
  transformControlPoint,
} from "./definition";
import { parseFloatInput, parseVectorInput } from "./inputs";
import { setField } from "./compile-values";
import { FIELD, type CompiledSystem, type FrameOperator } from "./types";
import { type JsonObject } from "./json";

const scratch: [number, number, number] = [0, 0, 0];
const scratchB: [number, number, number] = [0, 0, 0];
const vecA = new THREE.Vector3();
const vecB = new THREE.Vector3();
const quatA = new THREE.Quaternion();

export const compileOperator = (operator: JsonObject): FrameOperator | null => {
  switch (classOf(operator)) {
    case "C_OP_Decay":
      return (system) => {
        const lifetime = system.scalar(FIELD.lifetime);
        const created = system.scalar(FIELD.creationTime);
        for (let index = 0; index < system.count; index += 1) {
          if (system.age - created[index] >= lifetime[index])
            system.expire(index);
        }
      };
    case "C_OP_BasicMovement": {
      const gravityValue = new THREE.Vector3();
      const gravity = parseVectorInput(operator.m_Gravity, [0, 0, 0]);
      const drag = parseFloatInput(operator.m_fDrag, 0);
      const force = new THREE.Vector3();
      const total = new THREE.Vector3();
      return (system, delta) => {
        const context = system.focusCollection();
        gravity.evaluate(context, scratch);
        gravityValue.set(...scratch);
        const retention =
          (1 - Math.min(Math.max(drag.evaluate(context), 0), 1)) **
          (delta * 30);
        const position = system.vector(FIELD.position);
        const velocity = system.velocity;
        for (let index = 0; index < system.count; index += 1) {
          total.copy(gravityValue);
          for (const apply of system.spec.forces) {
            apply(system, index, force.set(0, 0, 0));
            total.add(force);
          }
          for (let axis = 0; axis < 3; axis += 1) {
            const slot = index * 3 + axis;
            velocity[slot] =
              (velocity[slot] + total.getComponent(axis) * delta) * retention;
            position[slot] += velocity[slot] * delta;
          }
        }
      };
    }
    case "C_OP_PositionLock": {
      const cpIndex = transformControlPoint(operator.m_TransformInput);
      const lockRotation = booleanOf(operator.m_bLockRot);
      return (system) => {
        const cp = system.controlPoint(cpIndex);
        const position = system.vector(FIELD.position);
        quatA.copy(cp.previousRotation).invert().premultiply(cp.rotation);
        for (let index = 0; index < system.count; index += 1) {
          vecA.fromArray(position, index * 3);
          if (lockRotation) {
            vecA
              .sub(cp.previousPosition)
              .applyQuaternion(quatA)
              .add(cp.position);
          } else {
            vecA.add(vecB.subVectors(cp.position, cp.previousPosition));
          }
          vecA.toArray(position, index * 3);
        }
      };
    }
    case "C_OP_SetFloat": {
      const input = parseFloatInput(operator.m_InputValue, 0);
      const field = numberOf(operator.m_nOutputField, FIELD.radius);
      const method = stringOf(operator.m_nSetMethod, "PARTICLE_SET_VALUE");
      return (system) => {
        for (let index = 0; index < system.count; index += 1) {
          setField(
            system,
            index,
            field,
            method,
            input.evaluate(system.focus(index)),
          );
        }
      };
    }
    case "C_OP_SetVec": {
      const input = parseVectorInput(operator.m_InputValue, [1, 1, 1]);
      const field = numberOf(operator.m_nOutputField, FIELD.color);
      return (system) => {
        const values = system.vector(field);
        for (let index = 0; index < system.count; index += 1) {
          input.evaluate(system.focus(index), scratch);
          values.set(scratch, index * 3);
        }
      };
    }
    case "C_OP_SpinUpdate":
      return (system, delta) => {
        const roll = system.scalar(FIELD.roll);
        const speed = system.scalar(FIELD.rollSpeed);
        for (let index = 0; index < system.count; index += 1)
          roll[index] += speed[index] * delta;
      };
    case "C_OP_Spin": {
      const rate = THREE.MathUtils.degToRad(
        numberOf(operator.m_nSpinRateDegrees, 0),
      );
      return (system, delta) => {
        const roll = system.scalar(FIELD.roll);
        for (let index = 0; index < system.count; index += 1)
          roll[index] += rate * delta;
      };
    }
    case "C_OP_FadeInSimple": {
      const fadeTime = numberOf(operator.m_flFadeInTime, 0.25);
      const field = numberOf(operator.m_nFieldOutput, FIELD.alpha);
      return (system, delta) => {
        const values = system.scalar(field);
        const initial = system.initialOf(field);
        for (let index = 0; index < system.count; index += 1) {
          const context = system.focus(index);
          const length = fadeTime * context.lifetime;
          if (length <= 0 || Math.max(0, context.age - delta) >= length)
            continue;
          const t = Math.min(Math.max(context.age / length, 0), 1);
          values[index] = (initial?.[index] ?? 1) * t * t * (3 - 2 * t);
        }
      };
    }
    case "C_OP_FadeOutSimple": {
      const fadeTime = numberOf(operator.m_flFadeOutTime, 0.25);
      const field = numberOf(operator.m_nFieldOutput, FIELD.alpha);
      return (system) => {
        const values = system.scalar(field);
        const initial = system.initialOf(field);
        for (let index = 0; index < system.count; index += 1) {
          const context = system.focus(index);
          const age = context.lifetime > 0 ? context.age / context.lifetime : 1;
          if (fadeTime <= 0 || age <= 1 - fadeTime) continue;
          const t = Math.min(Math.max((age - (1 - fadeTime)) / fadeTime, 0), 1);
          const faded = (initial?.[index] ?? 1) * (1 - t * t * (3 - 2 * t));
          values[index] = Math.min(values[index], faded);
        }
      };
    }
    case "C_OP_InterpolateRadius": {
      const start = numberOf(operator.m_flStartTime, 0);
      const end = numberOf(operator.m_flEndTime, 1);
      const startScale = parseFloatInput(operator.m_flStartScale, 1);
      const endScale = parseFloatInput(operator.m_flEndScale, 1);
      const ease = booleanOf(operator.m_bEaseInAndOut);
      const bias = numberOf(operator.m_flBias, 0.5) || 0.5;
      return (system, delta) => {
        if (end <= start) return;
        const radius = system.scalar(FIELD.radius);
        const initial = system.initialOf(FIELD.radius);
        for (let index = 0; index < system.count; index += 1) {
          const context = system.focus(index);
          if (context.lifetime <= 0) continue;
          const age = context.age / context.lifetime;
          const frame = delta / context.lifetime;
          if (age < start || age > frame + Math.max(end, start + frame))
            continue;
          let t = Math.min(Math.max((age - start) / (end - start), 0), 1);
          if (ease) t = t * t * (3 - 2 * t);
          else if (bias > 0 && bias < 1 && bias !== 0.5)
            t /= (1 / bias - 2) * (1 - t) + 1;
          const low = startScale.evaluate(context);
          radius[index] =
            (initial?.[index] ?? radius[index]) *
            (low + (endScale.evaluate(context) - low) * t);
        }
      };
    }
    case "C_OP_ClampScalar": {
      const field = numberOf(operator.m_nFieldOutput, FIELD.radius);
      const low = parseFloatInput(operator.m_flOutputMin, 0);
      const high = parseFloatInput(operator.m_flOutputMax, 1);
      return (system) => {
        const values = system.scalar(field);
        for (let index = 0; index < system.count; index += 1) {
          const context = system.focus(index);
          values[index] = Math.min(
            high.evaluate(context),
            Math.max(values[index], low.evaluate(context)),
          );
        }
      };
    }
    case "C_OP_RampScalarLinearSimple": {
      const rate = numberOf(operator.m_Rate, 0);
      const start = numberOf(operator.m_flStartTime, 0);
      const end = numberOf(operator.m_flEndTime, 1);
      const field = numberOf(operator.m_nField, FIELD.radius);
      return (system, delta) => {
        const values = system.scalar(field);
        for (let index = 0; index < system.count; index += 1) {
          const context = system.focus(index);
          if (context.lifetime <= 0) continue;
          const age = context.age / context.lifetime;
          if (age < start || age >= end) continue;
          const value = values[index] + rate * delta;
          values[index] =
            field === FIELD.alpha || field === FIELD.alpha2
              ? Math.min(Math.max(value, 0), 1)
              : field === FIELD.radius || field === FIELD.lifetime
                ? Math.max(value, 0)
                : value;
        }
      };
    }
    case "C_OP_ColorInterpolate": {
      const fade = numbersOf(operator.m_ColorFade, [255, 255, 255]);
      const start = numberOf(operator.m_flFadeStartTime, 0);
      const end = numberOf(operator.m_flFadeEndTime, 1);
      return (system) => {
        const color = system.vector(FIELD.color);
        const base = system.initialOf(FIELD.color);
        for (let index = 0; index < system.count; index += 1) {
          const context = system.focus(index);
          const t = context.lifetime > 0 ? context.age / context.lifetime : 0;
          const amount = Math.min(
            Math.max((t - start) / (end - start || 1), 0),
            1,
          );
          for (let channel = 0; channel < 3; channel += 1) {
            const from =
              base?.[index * 3 + channel] ?? color[index * 3 + channel];
            color[index * 3 + channel] =
              from + ((fade[channel] ?? 255) / 255 - from) * amount;
          }
        }
      };
    }
    case "C_OP_MovementRotateParticleAroundAxis": {
      const rate = parseFloatInput(operator.m_flRotRate, 180);
      const axisInput = parseVectorInput(operator.m_vecRotAxis, [0, 0, 1]);
      const cpIndex = transformControlPoint(operator.m_TransformInput);
      const local = booleanOf(operator.m_bLocalSpace);
      const axis = new THREE.Vector3();
      return (system, delta) => {
        const context = system.focusCollection();
        axisInput.evaluate(context, scratch);
        const cp = system.controlPoint(cpIndex);
        axis.set(scratch[0], scratch[1], scratch[2]).normalize();
        if (local) axis.applyQuaternion(cp.rotation);
        quatA.setFromAxisAngle(
          axis,
          THREE.MathUtils.degToRad(rate.evaluate(context)) * delta,
        );
        const position = system.vector(FIELD.position);
        for (let index = 0; index < system.count; index += 1) {
          vecA
            .fromArray(position, index * 3)
            .sub(cp.position)
            .applyQuaternion(quatA)
            .add(cp.position)
            .toArray(position, index * 3);
        }
      };
    }
    case "C_OP_SetToCP": {
      const cpIndex = numberOf(operator.m_nControlPointNumber, 1);
      const offset = numbersOf(operator.m_vecOffset, [0, 0, 0]);
      return (system) => {
        const cp = system.controlPoint(cpIndex);
        const position = system.vector(FIELD.position);
        vecB
          .set(offset[0] ?? 0, offset[1] ?? 0, offset[2] ?? 0)
          .applyQuaternion(cp.rotation)
          .add(cp.position);
        for (let index = 0; index < system.count; index += 1)
          vecB.toArray(position, index * 3);
      };
    }
    default:
      return null;
  }
};

export const compileForce = (
  operator: JsonObject,
): CompiledSystem["forces"][number] | null => {
  switch (classOf(operator)) {
    case "C_OP_AttractToControlPoint": {
      const amount = parseFloatInput(operator.m_fForceAmount, 100);
      const falloff = numberOf(operator.m_fFalloffPower, 0);
      const cpIndex = transformControlPoint(operator.m_TransformInput);
      return (system, index, out) => {
        const position = system.vector(FIELD.position);
        out
          .copy(system.controlPoint(cpIndex).position)
          .sub(vecA.fromArray(position, index * 3));
        const distance = Math.max(out.length(), 1);
        out.multiplyScalar(
          amount.evaluate(system.focus(index)) / distance ** (falloff + 1),
        );
      };
    }
    case "C_OP_CurlNoiseForce": {
      const scale = parseVectorInput(operator.m_vecNoiseScale, [1, 1, 1]);
      const frequency = parseVectorInput(operator.m_vecNoiseFreq, [1, 1, 1]);
      return (system, index, out) => {
        const context = system.focus(index);
        scale.evaluate(context, scratch);
        frequency.evaluate(context, scratchB);
        const position = system.vector(FIELD.position);
        const x = position[index * 3];
        const y = position[index * 3 + 1];
        const z = position[index * 3 + 2];
        const time = system.age;
        // A divergence-free swirl from crossed sine fields, standing in for curl noise.
        out
          .set(
            Math.sin(y * scratchB[1] + time) - Math.cos(z * scratchB[2] + time),
            Math.sin(z * scratchB[2] + time) - Math.cos(x * scratchB[0] + time),
            Math.sin(x * scratchB[0] + time) - Math.cos(y * scratchB[1] + time),
          )
          .multiply(vecB.set(scratch[0], scratch[1], scratch[2]));
      };
    }
    default:
      return null;
  }
};
