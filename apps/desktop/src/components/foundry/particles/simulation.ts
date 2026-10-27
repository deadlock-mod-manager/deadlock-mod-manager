import { Vector3, Quaternion } from "three";
import {
  bool,
  cp,
  fields,
  list,
  noise,
  num,
  Particle,
  scalar,
  str,
  vec,
  type ControlPoint,
  type Fields,
  type Inputs,
} from "./values";
import { initialize } from "./initializers";
import { enabled, operate, preEmission } from "./operators";

export class ParticleSimulation {
  readonly particles: Particle[] = [];
  readonly controls = new Map<number, ControlPoint>();
  readonly unsupported = new Set<string>();
  readonly context: Inputs;
  readonly children: {
    simulation: ParticleSimulation;
    delay: number;
    endcap: boolean;
  }[] = [];
  private readonly emitters: {
    op: Fields;
    emitted: boolean;
    fraction: number;
  }[];
  private readonly initializers: Fields[];
  private readonly operators: Fields[];
  private readonly pre: Fields[];
  private flattened: ParticleSimulation[] | null = null;
  private readonly maximum: number;
  private nextId = 0;
  private readonly restLengths = new Map<Fields, number>();
  age = 0;
  stopped = false;
  constructor(
    readonly definition: Fields,
    systems: Fields,
    private seed = 1,
    depth = 0,
    ancestors = new Set<Fields>(),
    budget = { remaining: 128, particles: 4096 },
  ) {
    budget.remaining--;
    const lineage = new Set(ancestors);
    lineage.add(definition);
    this.maximum = Math.min(
      512,
      budget.particles,
      list(definition.m_Emitters).length
        ? Math.max(1, num(definition.m_nMaxParticles, 1000))
        : 0,
    );
    budget.particles -= this.maximum;
    this.context = {
      age: 0,
      count: 0,
      controls: this.controls,
      random: () => {
        this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
        return this.seed / 4294967296;
      },
      unsupported: this.unsupported,
    };
    this.emitters = list(definition.m_Emitters)
      .map(fields)
      .map((op) => ({ op, emitted: false, fraction: 0 }));
    this.initializers = list(definition.m_Initializers).map(fields);
    this.operators = [
      ...list(definition.m_ForceGenerators),
      ...list(definition.m_Operators),
      ...list(definition.m_Constraints),
    ].map(fields);
    this.pre = list(definition.m_PreEmissionOperators).map(fields);
    if (depth < 12)
      for (const value of list(definition.m_Children)) {
        const child = fields(value),
          ref = str(child.m_ChildRef),
          data = systems[ref];
        const childDefinition = fields(data);
        if (lineage.has(childDefinition)) {
          this.unsupported.add(`Cyclic particle child: ${ref}`);
          continue;
        }
        if (budget.remaining <= 0) {
          this.unsupported.add("Particle graph budget exceeded");
          break;
        }
        if (data)
          this.children.push({
            simulation: new ParticleSimulation(
              fields(data),
              systems,
              seed + this.children.length + 1,
              depth + 1,
              lineage,
              budget,
            ),
            delay: num(child.m_flDelay),
            endcap: bool(child.m_bEndCap),
          });
        else this.unsupported.add(`Missing child: ${ref}`);
      }
  }
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    for (const child of this.children)
      if (!child.endcap) child.simulation.stop();
  }
  private spawn(count: number) {
    this.context.count = Math.min(
      this.maximum,
      Math.max(this.particles.length + count, 1),
    );
    for (let i = 0; i < count && this.particles.length < this.maximum; i++) {
      const color = vec(this.definition.m_ConstantColor, 255).multiplyScalar(
        1 / 255,
      );
      const p = new Particle(
        this.nextId++,
        this.age,
        color,
        num(this.definition.m_flConstantRadius, 5),
        num(this.definition.m_flConstantLifespan, 1),
      );
      p.index = this.particles.length;
      p.vector(0).copy(cp(this.context).position);
      p.snapshot();
      this.context.particle = p;
      for (const op of this.initializers)
        if (enabled(op, this.stopped, this.age))
          initialize(op, p, this.context);
      p.vector(2).copy(p.vector(0));
      p.spawnCP.copy(cp(this.context, p.lockCP).position);
      p.spawnRotation.copy(cp(this.context, p.lockCP).rotation);
      p.snapshot();
      this.particles.push(p);
    }
    this.context.particle = undefined;
  }
  step(dt: number) {
    this.context.age = this.age;
    this.context.count = this.maximum;
    for (const op of this.pre)
      if (enabled(op, this.stopped, this.age) && preEmission(op, this.context))
        this.stop();
    if (!this.stopped)
      for (const emitter of this.emitters) {
        const { op } = emitter;
        if (!enabled(op, false, this.age)) continue;
        const start = scalar(op.m_flStartTime, this.context),
          duration = scalar(op.m_flEmissionDuration, this.context);
        if (this.age < start || (duration > 0 && this.age > start + duration))
          continue;
        const name = str(op["_class"]);
        if (name === "C_OP_InstantaneousEmitter") {
          if (!emitter.emitted) {
            emitter.emitted = true;
            this.spawn(
              Math.max(
                0,
                Math.round(scalar(op.m_nParticlesToEmit, this.context, 100)),
              ),
            );
          }
        } else if (
          name === "C_OP_ContinuousEmitter" ||
          name === "C_OP_NoiseEmitter"
        ) {
          const rate =
            name === "C_OP_NoiseEmitter"
              ? Math.max(
                  0,
                  scalar(op.m_flOutputMin, this.context, 10) +
                    (scalar(op.m_flOutputMax, this.context, 10) -
                      scalar(op.m_flOutputMin, this.context, 10)) *
                      (noise(this.age, 0, 0) * 0.5 + 0.5),
                )
              : scalar(op.m_flEmitRate, this.context, 100);
          emitter.fraction += Math.max(0, rate) * dt;
          const count = Math.floor(emitter.fraction);
          emitter.fraction -= count;
          this.spawn(count);
        } else this.unsupported.add(name);
      }
    this.context.count = this.particles.length;
    for (const [index, p] of this.particles.entries()) {
      p.index = index;
      this.context.particle = p;
      p.age += dt;
      for (const op of this.operators)
        operate(op, p, this.context, dt, this.stopped);
    }
    this.context.particle = undefined;
    for (const op of this.operators) {
      if (
        str(op["_class"]) !== "C_OP_RopeSpringConstraint" ||
        this.particles.length < 2
      )
        continue;
      let base = this.restLengths.get(op);
      if (base === undefined) {
        base = 0;
        for (let i = 1; i < this.particles.length; i++)
          base += this.particles[i]
            .vector(0)
            .distanceTo(this.particles[i - 1].vector(0));
        base /= this.particles.length;
        this.restLengths.set(op, base);
      }
      const rest = scalar(op.m_flInitialRestingLength, this.context, -1),
        length =
          (rest >= 0 ? rest : base) *
          scalar(op.m_flRestLength, this.context, 1);
      const min = scalar(op.m_flMinDistance, this.context, 0.9) * length,
        max = scalar(op.m_flMaxDistance, this.context, 1.1) * length;
      for (let i = 1; i < this.particles.length; i++) {
        const a = this.particles[i - 1],
          b = this.particles[i],
          delta = b.vector(0).clone().sub(a.vector(0)),
          distance = delta.length();
        if (distance >= min && distance <= max) continue;
        delta.multiplyScalar(
          (((distance > max ? max : min) - distance) /
            Math.max(0.0001, distance)) *
            dt *
            num(op.m_flAdjustmentScale, 15),
        );
        if (a.values[34] === 0) b.vector(0).add(delta);
        else if (b.values[34] === 0) a.vector(0).sub(delta);
        else {
          a.vector(0).addScaledVector(delta, -0.5);
          b.vector(0).addScaledVector(delta, 0.5);
        }
      }
    }
    const decay = this.operators.some(
      (op) =>
        (str(op["_class"]) === "C_OP_Decay" ||
          str(op["_class"]) === "C_OP_FadeAndKill") &&
        enabled(op, this.stopped, this.age),
    );
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];

      if (
        (decay && p.age >= p.values[1]) ||
        p.age > 30 ||
        !Number.isFinite(p.vector(0).lengthSq())
      )
        this.particles.splice(i, 1);
    }
    for (const [childIndex, child] of this.children.entries()) {
      if (this.age < child.delay || (child.endcap && !this.stopped)) continue;
      for (const [index, at] of this.controls) {
        let target = child.simulation.controls.get(index);
        if (!target) {
          target = {
            position: new Vector3(),
            previous: new Vector3(),
            rotation: new Quaternion(),
          };
          child.simulation.controls.set(index, target);
        }
        target.previous.copy(target.position);
        target.position.copy(at.position);
        target.rotation.copy(at.rotation);
      }
      for (const op of [...this.operators, ...this.pre]) {
        if (str(op["_class"]) === "C_OP_SetChildControlPoints") {
          const first = num(op.m_nFirstControlPoint),
            offset = scalar(op.m_nFirstSourcePoint, this.context);
          for (
            let i = 0;
            i <
            Math.min(
              num(op.m_nNumControlPoints, 1),
              this.particles.length - offset,
            );
            i++
          ) {
            const p = this.particles[i + offset];
            const at = cp(child.simulation.context, first + i);
            at.previous.copy(at.position);
            at.position.copy(p.vector(0));
          }
        } else if (
          str(op["_class"]) === "C_OP_SetParentControlPointsToChildCP"
        ) {
          if (childIndex < num(op.m_nNumControlPoints, 1)) {
            const source = cp(
              this.context,
              num(op.m_nFirstSourcePoint) + childIndex,
            );
            const target = cp(
              child.simulation.context,
              num(op.m_nChildControlPoint),
            );
            target.previous.copy(target.position);
            target.position.copy(source.position);
            if (bool(op.m_bSetOrientation))
              target.rotation.copy(source.rotation);
          }
        }
      }
      child.simulation.step(dt);
    }
    this.age += dt;
    for (const at of this.controls.values()) at.previous.copy(at.position);
  }
  all(): ParticleSimulation[] {
    this.flattened ??= [
      this,
      ...this.children.flatMap((child) => child.simulation.all()),
    ];
    return this.flattened;
  }
}
