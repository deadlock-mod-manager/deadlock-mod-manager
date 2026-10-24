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
  kind: "sprites" | "ropes";
  texture: string | null;
  additive: boolean;
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
  diagnostics: ParticleDiagnostic[];
  path: string;
  maxParticles: number;
  constantLifetime: number;
  constantRadius: number;
  constantColor: [number, number, number, number];
  constantSequence: number;
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
  preEmission: ((controlPoints: ControlPoint[]) => void)[];
  renderers: SpriteRendererSpec[];
  /** Why this system is not simulated, when it is not. */
  blockedBy: string | null;
  children: CompiledSystem[];
  /** The `preview` control point drivers, read from the root system only. */
  drivers: { controlPoint: number; attachment: string | null }[];
}
