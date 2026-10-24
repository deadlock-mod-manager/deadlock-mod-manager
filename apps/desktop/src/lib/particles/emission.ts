import * as THREE from "three";
import { z } from "zod";
import {
  numberOf,
  classOf,
  booleanOf,
  transformControlPoint,
} from "./definition";
import { parseFloatInput, parseVectorInput } from "./inputs";
import { STATIC_CONTEXT } from "./compile-values";
import { type CompiledSystem, type Emitter } from "./types";
import { type JsonObject } from "./json";

const scratch: [number, number, number] = [0, 0, 0];
const vecA = new THREE.Vector3();

export const compileEmitter = (operator: JsonObject): Emitter | null => {
  if (
    booleanOf(operator.m_bInitFromKilledParentParticles) ||
    z.string().safeParse(operator.m_nEventType).success
  )
    return null;
  const startTime = numberOf(operator.m_flStartTime, 0);
  switch (classOf(operator)) {
    case "C_OP_ContinuousEmitter": {
      const rate = parseFloatInput(operator.m_flEmitRate, 100);
      const duration = parseFloatInput(operator.m_flEmissionDuration, 0);
      return (system, delta) => {
        const context = system.focusCollection();
        const limit = duration.evaluate(context);
        const endTime = limit > 0 ? startTime + limit : system.age;
        const activeDelta = Math.max(
          0,
          Math.min(system.age, endTime) -
            Math.max(system.age - delta, startTime),
        );
        return Math.max(rate.evaluate(context), 0) * activeDelta;
      };
    }
    case "C_OP_InstantaneousEmitter": {
      const count = parseFloatInput(operator.m_nParticlesToEmit, 1);
      return (system, _delta, before) => {
        if (
          system.age < startTime ||
          (before >= startTime && !(before === 0 && startTime === 0))
        )
          return 0;
        return Math.max(
          Math.round(count.evaluate(system.focusCollection())),
          0,
        );
      };
    }
    case "C_OP_NoiseEmitter": {
      const low = numberOf(operator.m_flOutputMin, 0);
      const high = numberOf(operator.m_flOutputMax, 100);
      return (system, delta) =>
        Math.max(
          low + (high - low) * (0.5 + 0.5 * Math.sin(system.age * 1.7)),
          0,
        ) * delta;
    }
    default:
      return null;
  }
};
export const compilePreEmission = (
  operator: JsonObject,
): CompiledSystem["preEmission"][number] | null => {
  if (classOf(operator) !== "C_OP_SetSingleControlPointPosition") return null;
  const target = numberOf(operator.m_nCP1, 1);
  const source = transformControlPoint(operator.m_transformInput);
  const offset = parseVectorInput(operator.m_vecCP1Pos, [0, 0, 0]);
  return (controlPoints) => {
    const from = controlPoints[source] ?? controlPoints[0];
    offset.evaluate(STATIC_CONTEXT, scratch);
    const position = vecA
      .set(scratch[0], scratch[1], scratch[2])
      .applyQuaternion(from.rotation)
      .add(from.position);
    const point = controlPoints[target];
    if (point) {
      point.position.copy(position);
      point.rotation.copy(from.rotation);
    }
  };
};
