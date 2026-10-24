import { type InputContext, hash01 } from "./inputs";
import {
  FIELD,
  VECTOR_FIELDS,
  MAX_PARTICLES,
  type CompiledSystem,
  type ControlPoint,
} from "./types";

/** One live simulation of a compiled system. */
export class ParticleSystem {
  readonly spec: CompiledSystem;
  readonly controlPoints: ControlPoint[];
  count = 0;
  age = 0;
  private emitCarry = 0;
  private restartTimer = 0;
  private hasEmitted = false;
  private readonly capacity: number;
  private readonly scalars = new Map<number, Float32Array>();
  private readonly vectors = new Map<number, Float32Array>();
  /** Values written at spawn, for operators that scale the initial value. */
  private readonly initial = new Map<number, Float32Array>();
  readonly velocity: Float32Array;
  readonly seeds: Float32Array;
  readonly context: InputContext;
  private current = 0;
  private serial = 0;

  constructor(spec: CompiledSystem, controlPoints: ControlPoint[]) {
    this.spec = spec;
    this.controlPoints = controlPoints;
    this.capacity = Math.min(Math.max(spec.maxParticles, 1), MAX_PARTICLES);
    this.velocity = new Float32Array(this.capacity * 3);
    this.seeds = new Float32Array(this.capacity);
    const point: [number, number, number] = [0, 0, 0];
    this.context = {
      age: 0,
      lifetime: 1,
      collectionAge: 0,
      index: 0,
      count: 0,
      seed: 0,
      scalar: (field) => this.scalar(field)[this.current] ?? 0,
      controlPoint: (index) => {
        const cp = this.controlPoint(index);
        point[0] = cp.position.x;
        point[1] = cp.position.y;
        point[2] = cp.position.z;
        return point;
      },
    };
  }

  scalar(field: number) {
    let values = this.scalars.get(field);
    if (!values) {
      values = new Float32Array(this.capacity);
      if (field === FIELD.alpha2) values.fill(1);
      this.scalars.set(field, values);
    }
    return values;
  }

  vector(field: number) {
    let values = this.vectors.get(field);
    if (!values) {
      values = new Float32Array(this.capacity * 3);
      this.vectors.set(field, values);
    }
    return values;
  }

  initialOf(field: number) {
    return this.initial.get(field);
  }

  controlPoint(index: number): ControlPoint {
    return this.controlPoints[index] ?? this.controlPoints[0];
  }

  /** Point the shared input context at particle `index`. */
  focus(index: number) {
    this.current = index;
    const context = this.context;
    context.index = index;
    context.count = this.count;
    context.seed = this.seeds[index];
    context.lifetime = this.scalar(FIELD.lifetime)[index];
    context.age = Math.max(
      0,
      this.age - this.scalar(FIELD.creationTime)[index],
    );
    context.collectionAge = this.age;
    return context;
  }

  /** Point the context at the system itself, for per-emitter inputs. */
  focusCollection() {
    const context = this.context;
    context.index = 0;
    context.count = this.count;
    context.seed = 0.5;
    context.age = this.age;
    context.lifetime = 1;
    context.collectionAge = this.age;
    return context;
  }

  private spawn() {
    if (this.count >= this.capacity) return;
    const index = this.count;
    this.count += 1;
    this.serial += 1;
    this.seeds[index] = hash01(this.serial, this.spec.maxParticles);
    const { spec } = this;
    for (const values of this.scalars.values()) values[index] = 0;
    for (const values of this.vectors.values())
      values.fill(0, index * 3, index * 3 + 3);
    this.scalar(FIELD.lifetime)[index] = spec.constantLifetime;
    this.scalar(FIELD.radius)[index] = spec.constantRadius;
    this.scalar(FIELD.roll)[index] = 0;
    this.scalar(FIELD.rollSpeed)[index] = 0;
    this.scalar(FIELD.alpha)[index] = spec.constantColor[3];
    this.scalar(FIELD.alpha2)[index] = 1;
    this.scalar(FIELD.sequence)[index] = spec.constantSequence;
    this.scalar(FIELD.creationTime)[index] = this.age;
    const color = this.vector(FIELD.color);
    color.set(spec.constantColor.slice(0, 3), index * 3);
    const origin = this.controlPoint(0).position;
    this.vector(FIELD.position).set([origin.x, origin.y, origin.z], index * 3);
    this.velocity.fill(0, index * 3, index * 3 + 3);
    this.captureInitial(index);
    for (const initializer of spec.initializers) initializer(this, index);
    this.captureInitial(index);
  }

  private captureInitial(index: number) {
    for (const [field, values] of this.scalars) {
      let initial = this.initial.get(field);
      if (!initial) {
        initial = new Float32Array(this.capacity);
        this.initial.set(field, initial);
      }
      initial[index] = values[index];
    }
    for (const [field, values] of this.vectors) {
      let initial = this.initial.get(field);
      if (!initial) {
        initial = new Float32Array(this.capacity * 3);
        this.initial.set(field, initial);
      }
      initial.set(values.subarray(index * 3, index * 3 + 3), index * 3);
    }
  }

  private kill(index: number) {
    const last = this.count - 1;
    if (index !== last) {
      for (const values of this.scalars.values()) values[index] = values[last];
      for (const [field, values] of this.initial) {
        if (VECTOR_FIELDS.has(field))
          values.copyWithin(index * 3, last * 3, last * 3 + 3);
        else values[index] = values[last];
      }
      for (const values of this.vectors.values())
        values.copyWithin(index * 3, last * 3, last * 3 + 3);
      this.velocity.copyWithin(index * 3, last * 3, last * 3 + 3);
      this.seeds[index] = this.seeds[last];
    }
    this.count = last;
  }

  update(delta: number) {
    const { spec } = this;
    if (spec.blockedBy || !Number.isFinite(delta) || delta <= 0) return;
    const previousAge = this.age;
    this.age += delta;
    let emitted = 0;
    for (const emitter of spec.emitters)
      emitted += emitter(this, delta, previousAge);
    if (emitted > 0) this.hasEmitted = true;
    this.emitCarry += emitted;
    const count = Math.min(
      Math.floor(this.emitCarry),
      this.capacity - this.count,
    );
    for (let index = 0; index < count; index += 1) this.spawn();
    this.emitCarry = Number.isFinite(this.emitCarry) ? this.emitCarry % 1 : 0;
    for (const operator of spec.operators) operator(this, delta);
    // Particles past their lifetime are removed by C_OP_Decay; without it they persist.
    const lifetime = this.scalar(FIELD.lifetime);
    const created = this.scalar(FIELD.creationTime);
    for (let index = this.count - 1; index >= 0; index -= 1) {
      if (lifetime[index] < 0 || this.age - created[index] > 60)
        this.kill(index);
    }
    // One-shot effects replay so a looping preview keeps showing them.
    if (
      !spec.continuous &&
      this.hasEmitted &&
      this.count === 0 &&
      this.age >= spec.lastEmissionTime &&
      this.age > 0.25
    ) {
      this.restartTimer += delta;
      if (this.restartTimer > 0.75) this.restart();
    } else this.restartTimer = 0;
  }

  /** Marks a particle for removal at the end of the frame. */
  expire(index: number) {
    this.scalar(FIELD.lifetime)[index] = -1;
  }

  reset() {
    this.restart();
    this.serial = 0;
    for (const values of this.scalars.values()) values.fill(0);
    for (const values of this.vectors.values()) values.fill(0);
    for (const values of this.initial.values()) values.fill(0);
  }

  restart() {
    this.age = 0;
    this.count = 0;
    this.emitCarry = 0;
    this.restartTimer = 0;
    this.hasEmitted = false;
  }
}
