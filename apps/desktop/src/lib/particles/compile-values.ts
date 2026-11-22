import type { InputContext } from "./inputs";
import { type ParticleSystem } from "./system";

/** Inputs evaluated once at compile time see a neutral particle. */
export const STATIC_CONTEXT: InputContext = {
  age: 0,
  lifetime: 1,
  collectionAge: 0,
  index: 0,
  count: 1,
  seed: 0.5,
  scalar: () => 0,
  controlPoint: () => [0, 0, 0],
};
export const setField = (
  system: ParticleSystem,
  index: number,
  field: number,
  method: string,
  value: number,
) => {
  const values = system.scalar(field);
  const initial = system.initialOf(field)?.[index] ?? values[index];
  switch (method) {
    case "PARTICLE_SET_SCALE_INITIAL_VALUE":
      values[index] = initial * value;
      return;
    case "PARTICLE_SET_ADD_TO_INITIAL_VALUE":
      values[index] = initial + value;
      return;
    case "PARTICLE_SET_SCALE_CURRENT_VALUE":
      values[index] *= value;
      return;
    case "PARTICLE_SET_ADD_TO_CURRENT_VALUE":
      values[index] += value;
      return;
    default:
      values[index] = value;
  }
};
