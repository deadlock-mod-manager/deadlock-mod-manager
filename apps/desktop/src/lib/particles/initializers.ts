import * as THREE from "three";
import { z } from "zod";
import {
  numberOf,
  stringOf,
  numbersOf,
  classOf,
  booleanOf,
  transformControlPoint,
} from "./definition";
import { hash01, parseFloatInput, parseVectorInput } from "./inputs";
import { setField } from "./compile-values";
import { PATH_PROGRESS, parsePathParams, pathPoint } from "./path";
import { FIELD, type InitOperator } from "./types";
import { type JsonObject } from "./json";

type Combine = (a: number, b: number) => number;
const add: Combine = (a, b) => a + b;
const SCALAR_EXPRESSIONS = new Map<string, Combine>([
  ["SCALAR_EXPRESSION_SUBTRACT", (a, b) => a - b],
  ["SCALAR_EXPRESSION_MUL", (a, b) => a * b],
  ["SCALAR_EXPRESSION_DIVIDE", (a, b) => (b === 0 ? 0 : a / b)],
  [
    "SCALAR_EXPRESSION_MOD",
    (a, b) => (b === 0 ? 0 : a - b * Math.floor(a / b)),
  ],
  ["SCALAR_EXPRESSION_MIN", (a, b) => Math.min(a, b)],
  ["SCALAR_EXPRESSION_MAX", (a, b) => Math.max(a, b)],
]);
const VECTOR_EXPRESSIONS = new Map<string, Combine>([
  ["VECTOR_EXPRESSION_MUL", (a, b) => a * b],
  ["VECTOR_EXPRESSION_SUBTRACT", (a, b) => a - b],
  ["VECTOR_EXPRESSION_DIVIDE", (a, b) => (b === 0 ? 0 : a / b)],
]);

const scratch: [number, number, number] = [0, 0, 0];
const scratchB: [number, number, number] = [0, 0, 0];
const vecA = new THREE.Vector3();
const vecB = new THREE.Vector3();

/** A seeded point between `scratch` and `scratchB`, one salt per axis. */
const randomInScratchBox = (seed: number, salt: number, out: THREE.Vector3) =>
  out.set(
    scratch[0] + (scratchB[0] - scratch[0]) * hash01(seed, salt),
    scratch[1] + (scratchB[1] - scratch[1]) * hash01(seed, salt + 1),
    scratch[2] + (scratchB[2] - scratch[2]) * hash01(seed, salt + 2),
  );
const randomUnitVector = (seedA: number, seedB: number, out: THREE.Vector3) => {
  const theta = seedA * Math.PI * 2;
  const z = seedB * 2 - 1;
  const r = Math.sqrt(1 - z * z);
  return out.set(r * Math.cos(theta), r * Math.sin(theta), z);
};

export const compileInitializer = (
  operator: JsonObject,
): InitOperator | null => {
  switch (classOf(operator)) {
    case "C_INIT_CreateSequentialPath":
    case "C_INIT_CreateSequentialPathV2": {
      // Each new particle takes the next of `m_flNumToAssign` evenly spaced
      // stops between the path's control points, wrapping after the last.
      const stops = parseFloatInput(operator.m_flNumToAssign, 100);
      const path = parsePathParams(operator.m_PathParams);
      return (system, index) => {
        const total = Math.max(
          1,
          Math.round(stops.evaluate(system.focus(index))),
        );
        const stop = (system.spawned - 1) % total;
        const progress = total > 1 ? stop / (total - 1) : 0;
        system.scalar(PATH_PROGRESS)[index] = progress;
        pathPoint(path, (point) => system.controlPoint(point), progress, vecA);
        system.vector(FIELD.position).set([vecA.x, vecA.y, vecA.z], index * 3);
      };
    }
    case "C_INIT_InitFloat": {
      const input = parseFloatInput(operator.m_InputValue, 0);
      const field = numberOf(operator.m_nOutputField, FIELD.radius);
      const method = stringOf(operator.m_nSetMethod, "PARTICLE_SET_VALUE");
      return (system, index) =>
        setField(
          system,
          index,
          field,
          method,
          input.evaluate(system.focus(index)),
        );
    }
    case "C_INIT_InitVec": {
      const input = parseVectorInput(operator.m_InputValue, [1, 1, 1]);
      const field = numberOf(operator.m_nOutputField, FIELD.color);
      return (system, index) => {
        input.evaluate(system.focus(index), scratch);
        system.vector(field).set(scratch, index * 3);
      };
    }
    case "C_INIT_RandomColor": {
      const low = numbersOf(operator.m_ColorMin, [255, 255, 255]);
      const high = numbersOf(operator.m_ColorMax, [255, 255, 255]);
      return (system, index) => {
        const t = hash01(system.seeds[index], 11);
        const color = system.vector(FIELD.color);
        for (let channel = 0; channel < 3; channel += 1) {
          color[index * 3 + channel] =
            ((low[channel] ?? 255) +
              ((high[channel] ?? 255) - (low[channel] ?? 255)) * t) /
            255;
        }
      };
    }
    case "C_INIT_RandomSequence": {
      const low = numberOf(operator.m_nSequenceMin, 0);
      const high = numberOf(operator.m_nSequenceMax, 0);
      return (system, index) => {
        system.scalar(FIELD.sequence)[index] = Math.floor(
          low + (high - low + 1) * hash01(system.seeds[index], 13),
        );
      };
    }
    case "C_INIT_CreateWithinSphereTransform":
    case "C_INIT_CreateWithinSphere": {
      const radiusMin = parseFloatInput(operator.m_fRadiusMin, 0);
      const radiusMax = parseFloatInput(operator.m_fRadiusMax, 0);
      const speedMin = parseFloatInput(operator.m_fSpeedMin, 0);
      const speedMax = parseFloatInput(operator.m_fSpeedMax, 0);
      const localMin = parseVectorInput(
        operator.m_LocalCoordinateSystemSpeedMin,
        [0, 0, 0],
      );
      const localMax = parseVectorInput(
        operator.m_LocalCoordinateSystemSpeedMax,
        [0, 0, 0],
      );
      const bias = parseVectorInput(operator.m_vecDistanceBias, [1, 1, 1]);
      const cpIndex = z.number().safeParse(operator.m_nControlPointNumber)
        .success
        ? numberOf(operator.m_nControlPointNumber, 0)
        : transformControlPoint(operator.m_TransformInput);
      return (system, index) => {
        const context = system.focus(index);
        const seed = system.seeds[index];
        const cp = system.controlPoint(cpIndex);
        const direction = randomUnitVector(
          hash01(seed, 21),
          hash01(seed, 22),
          vecA,
        );
        bias.evaluate(context, scratch);
        direction.multiply(vecB.set(scratch[0], scratch[1], scratch[2]));
        const low = radiusMin.evaluate(context);
        const radius =
          low + (radiusMax.evaluate(context) - low) * hash01(seed, 23);
        const position = vecB
          .copy(direction)
          .multiplyScalar(radius)
          .applyQuaternion(cp.rotation)
          .add(cp.position);
        system
          .vector(FIELD.position)
          .set([position.x, position.y, position.z], index * 3);
        const speedLow = speedMin.evaluate(context);
        const speed =
          speedLow + (speedMax.evaluate(context) - speedLow) * hash01(seed, 24);
        localMin.evaluate(context, scratch);
        localMax.evaluate(context, scratchB);
        const local = randomInScratchBox(seed, 25, vecB).applyQuaternion(
          cp.rotation,
        );
        const velocity = local.addScaledVector(direction.normalize(), speed);
        system.velocity.set([velocity.x, velocity.y, velocity.z], index * 3);
      };
    }
    case "C_INIT_CreateWithinBox": {
      const low = parseVectorInput(operator.m_vecMin, [0, 0, 0]);
      const high = parseVectorInput(operator.m_vecMax, [0, 0, 0]);
      const cpIndex = numberOf(operator.m_nControlPointNumber, 0);
      const local = booleanOf(operator.m_bLocalSpace);
      return (system, index) => {
        const context = system.focus(index);
        const seed = system.seeds[index];
        low.evaluate(context, scratch);
        high.evaluate(context, scratchB);
        const cp = system.controlPoint(cpIndex);
        const offset = randomInScratchBox(seed, 31, vecA);
        if (local) offset.applyQuaternion(cp.rotation);
        offset.add(cp.position);
        system
          .vector(FIELD.position)
          .set([offset.x, offset.y, offset.z], index * 3);
      };
    }
    case "C_INIT_PositionOffset": {
      const low = parseVectorInput(operator.m_OffsetMin, [0, 0, 0]);
      const high = parseVectorInput(operator.m_OffsetMax, [0, 0, 0]);
      const local = booleanOf(operator.m_bLocalCoords);
      const cpIndex = transformControlPoint(operator.m_TransformInput);
      return (system, index) => {
        const context = system.focus(index);
        const seed = system.seeds[index];
        low.evaluate(context, scratch);
        high.evaluate(context, scratchB);
        const offset = randomInScratchBox(seed, 41, vecA);
        if (local)
          offset.applyQuaternion(system.controlPoint(cpIndex).rotation);
        const position = system.vector(FIELD.position);
        position[index * 3] += offset.x;
        position[index * 3 + 1] += offset.y;
        position[index * 3 + 2] += offset.z;
      };
    }
    case "C_INIT_VelocityRandom": {
      const speedMin = parseFloatInput(operator.m_fSpeedMin, 0);
      const speedMax = parseFloatInput(operator.m_fSpeedMax, 0);
      const localMin = parseVectorInput(
        operator.m_LocalCoordinateSystemSpeedMin,
        [0, 0, 0],
      );
      const localMax = parseVectorInput(
        operator.m_LocalCoordinateSystemSpeedMax,
        [0, 0, 0],
      );
      const cpIndex = numberOf(operator.m_nControlPointNumber, 0);
      return (system, index) => {
        const context = system.focus(index);
        const seed = system.seeds[index];
        localMin.evaluate(context, scratch);
        localMax.evaluate(context, scratchB);
        const velocity = randomInScratchBox(seed, 51, vecA).applyQuaternion(
          system.controlPoint(cpIndex).rotation,
        );
        const low = speedMin.evaluate(context);
        const speed =
          low + (speedMax.evaluate(context) - low) * hash01(seed, 54);
        velocity.addScaledVector(
          randomUnitVector(hash01(seed, 55), hash01(seed, 56), vecB),
          speed,
        );
        const out = system.velocity;
        out[index * 3] += velocity.x;
        out[index * 3 + 1] += velocity.y;
        out[index * 3 + 2] += velocity.z;
      };
    }
    case "C_INIT_RingWave": {
      const radius = parseFloatInput(operator.m_flInitialRadius, 0);
      const thickness = parseFloatInput(operator.m_flThickness, 0);
      const perOrbit = parseFloatInput(operator.m_flParticlesPerOrbit, -1);
      const even = booleanOf(operator.m_bEvenDistribution);
      const cpIndex = numberOf(operator.m_nControlPointNumber, 0);
      return (system, index) => {
        const context = system.focus(index);
        const seed = system.seeds[index];
        const orbit = perOrbit.evaluate(context);
        const angle =
          even && orbit > 0
            ? ((index % orbit) / orbit) * Math.PI * 2
            : hash01(seed, 61) * Math.PI * 2;
        const distance =
          radius.evaluate(context) +
          (hash01(seed, 62) - 0.5) * thickness.evaluate(context);
        const cp = system.controlPoint(cpIndex);
        const position = vecA
          .set(Math.cos(angle) * distance, Math.sin(angle) * distance, 0)
          .applyQuaternion(cp.rotation)
          .add(cp.position);
        system
          .vector(FIELD.position)
          .set([position.x, position.y, position.z], index * 3);
      };
    }
    case "C_INIT_SetAttributeToScalarExpression": {
      const first = parseFloatInput(operator.m_flInput1, 0);
      const second = parseFloatInput(operator.m_flInput2, 0);
      const field = numberOf(operator.m_nOutputField, FIELD.radius);
      const combine =
        SCALAR_EXPRESSIONS.get(stringOf(operator.m_nExpression, "")) ?? add;
      return (system, index) => {
        const context = system.focus(index);
        system.scalar(field)[index] = combine(
          first.evaluate(context),
          second.evaluate(context),
        );
      };
    }
    case "C_INIT_SetVectorAttributeToVectorExpression": {
      const first = parseVectorInput(operator.m_vInput1, [0, 0, 0]);
      const second = parseVectorInput(operator.m_vInput2, [1, 1, 1]);
      const field = numberOf(operator.m_nOutputField, FIELD.color);
      const combine =
        VECTOR_EXPRESSIONS.get(stringOf(operator.m_nExpression, "")) ?? add;
      return (system, index) => {
        const context = system.focus(index);
        first.evaluate(context, scratch);
        second.evaluate(context, scratchB);
        for (let axis = 0; axis < 3; axis += 1)
          scratch[axis] = combine(scratch[axis], scratchB[axis]);
        system.vector(field).set(scratch, index * 3);
      };
    }
    default:
      return null;
  }
};
