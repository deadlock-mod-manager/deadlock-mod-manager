import type * as THREE from "three";
import type { FloatInput, VectorInput } from "./inputs";
import { type ParticleSystem } from "./system";

/** Particle attribute indices used by Source 2 (`ParticleAttributeIndex_t`). */
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

/** A control point in the effect's Source-space frame. */
export interface ControlPoint {
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  previousPosition: THREE.Vector3;
  previousRotation: THREE.Quaternion;
}

/** Writes for one particle. */
export type InitOperator = (system: ParticleSystem, index: number) => void;
/** Runs over every live particle each frame. */
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
  /** A second layer multiplied over the first, like a ring masking noise. */
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

/** Machine-readable data; the caller supplies localized labels. */
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
  /** Timing of this instance relative to its parent; roots start immediately. */
  lifecycle: { delay: number; endCap: boolean };
  diagnostics: ParticleDiagnostic[];
  path: string;
  maxParticles: number;
  constantLifetime: number;
  constantRadius: number;
  constantColor: [number, number, number, number];
  constantSequence: number;
  /** Velocity history duration in seconds for trail renderers. */
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
  /** Why this system is not simulated, when it is not. */
  blockedBy: string | null;
  children: CompiledSystem[];
  /**
   * The system's own `preview` control point drivers.
   * `offset` is in the attachment's frame, or the model's when unattached.
   */
  drivers: {
    controlPoint: number;
    attachment: string | null;
    offset: [number, number, number];
  }[];
}
