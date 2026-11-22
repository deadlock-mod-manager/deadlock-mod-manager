import type * as THREE from "three";
import type { FloatInput, VectorInput } from "./inputs";
import { type ParticleSystem } from "./system";

export const FIELD = {
  position: 0,
  lifetime: 1,
  radius: 3,
  roll: 4,
  rollSpeed: 5,
  color: 6,
  alpha: 7,
  creationTime: 8,
  sequence: 9,
  trailLength: 10,
  alpha2: 16,
  normal: 21,
};

export const VECTOR_FIELDS = new Set([0, 2, 6, 15, 17, 21, 22]);
export const MAX_PARTICLES = 400;

export interface ControlPoint {
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  previousPosition: THREE.Vector3;
  previousRotation: THREE.Quaternion;
}

export type InitOperator = (system: ParticleSystem, index: number) => void;
export type FrameOperator = (system: ParticleSystem, delta: number) => void;
export type Emitter = (
  system: ParticleSystem,
  delta: number,
  previousAge: number,
) => number;

export interface SpriteRendererSpec {
  kind: "sprites" | "ropes" | "trails" | "models";
  phase: "any" | "active" | "endcap";
  models: string[];
  texture: string | null;
  mask: string | null;
  distortionTexture: string | null;
  refractive: boolean;
  additive: boolean;
  blend: "alpha" | "add" | "multiply" | "opaque";
  minLength: FloatInput;
  maxLength: FloatInput;
  lengthScale: FloatInput;
  lengthFadeInTime: FloatInput;
  tailAlphaScale: FloatInput;
  tailColorScale: VectorInput;
  constrainRadiusToLengthRatio: FloatInput;
  ignoreDT: boolean;
  tailFade: boolean;
  subdivisions: number;
  refractStrength: FloatInput;
  uvScale: [number, number];
  uvOffset: [number, number];
  overbright: FloatInput;
  alphaScale: FloatInput;
  radiusScale: FloatInput;
  colorScale: VectorInput;
  alpha2Field: number;
  animationRate: number;
  textureVWorldSize: number;
  textureVScrollRate: number;
}

export type ParticleStage =
  | "definition"
  | "emitter"
  | "initializer"
  | "operator"
  | "force"
  | "constraint"
  | "renderer"
  | "pre-emission"
  | "attachment";

export interface ParticleDiagnostic {
  path: string;
  stage: ParticleStage;
  className: string;
  code:
    | "unsupported"
    | "blocked"
    | "approximation"
    | "unsupported-input"
    | "invalid-definition"
    | "system-limit"
    | "missing-texture"
    | "missing-attachment";
  detail?: string;
}

export interface CompiledSystem {
  lifecycle: { delay: number; endCap: boolean };
  diagnostics: ParticleDiagnostic[];
  path: string;
  maxParticles: number;
  constantLifetime: number;
  constantRadius: number;
  constantColor: [number, number, number, number];
  constantSequence: number;
  constantTrailLength: number;
  emitters: Emitter[];
  continuous: boolean;
  lastEmissionTime: number;
  initializers: InitOperator[];
  operators: FrameOperator[];
  forces: ((
    system: ParticleSystem,
    index: number,
    out: THREE.Vector3,
  ) => void)[];
  preEmission: ((
    controlPoints: ControlPoint[],
    system?: ParticleSystem,
  ) => void)[];
  renderers: SpriteRendererSpec[];
  blockedBy: string | null;
  children: CompiledSystem[];
  drivers: {
    controlPoint: number;
    attachment: string | null;
    offset: [number, number, number];
  }[];
}
