import { Quaternion, Vector3 } from "three";
import { ParticleSystem } from "./system";
import type { CompiledSystem, ControlPoint } from "./types";

const CONTROL_POINTS = 64;

export interface ParticleHierarchyNode {
  spec: CompiledSystem;
  system: ParticleSystem;
  controlPoints: ControlPoint[];
  parent: ParticleHierarchyNode | null;
  state: "waiting" | "running" | "ending" | "cancelled";
  startAt: number | null;
  releaseAt: number | null;
}

/** One deterministic timeline for a hierarchy; children never replay independently. */
export class ParticleHierarchy {
  readonly nodes: ParticleHierarchyNode[] = [];
  age = 0;
  private released = false;
  private replayWait = 0;
  private seed = 0;
  private readonly autoReplay: boolean;
  private readonly replayNodes: ParticleHierarchyNode[] = [];

  constructor(root: CompiledSystem, options: { autoReplay?: boolean } = {}) {
    this.autoReplay = options.autoReplay ?? false;
    const add = (
      spec: CompiledSystem,
      parent: ParticleHierarchyNode | null,
    ) => {
      const controlPoints: ControlPoint[] = Array.from(
        { length: CONTROL_POINTS },
        () => ({
          position: new Vector3(),
          rotation: new Quaternion(),
          previousPosition: new Vector3(),
          previousRotation: new Quaternion(),
        }),
      );
      const node: ParticleHierarchyNode = {
        spec,
        system: new ParticleSystem(spec, controlPoints, { autoReplay: false }),
        controlPoints,
        parent,
        state: "waiting",
        startAt: null,
        releaseAt: null,
      };
      this.nodes.push(node);
      if (!spec.blockedBy) this.replayNodes.push(node);
      parent?.system.childControlPoints.push(controlPoints);
      for (const child of spec.children) add(child, node);
    };
    add(root, null);
    this.reset();
  }

  reset(seed = this.seed) {
    this.seed = seed;
    this.age = 0;
    this.released = false;
    this.replayWait = 0;
    for (const node of this.nodes) {
      node.system.reset(seed);
      node.releaseAt = null;
      node.startAt = !node.parent
        ? 0
        : node.spec.lifecycle.endCap || node.parent.startAt === null
          ? null
          : node.parent.startAt + node.spec.lifecycle.delay;
      node.state = node.startAt === 0 ? "running" : "waiting";
    }
  }

  /** Release active systems, cancel unreached ordinary children, and arm end caps. */
  release() {
    if (this.released) return;
    this.released = true;
    for (const node of this.nodes) {
      if (node.spec.lifecycle.endCap) {
        const trigger =
          node.parent?.releaseAt ?? node.parent?.startAt ?? this.age;
        node.startAt = trigger + node.spec.lifecycle.delay;
        continue;
      }
      if (
        node.parent &&
        (node.parent.spec.lifecycle.endCap || node.parent.releaseAt === null)
      ) {
        if (node.parent.startAt !== null)
          node.startAt = node.parent.startAt + node.spec.lifecycle.delay;
        continue;
      }
      node.releaseAt = this.age;
      if (node.state === "waiting") node.state = "cancelled";
      else {
        node.state = "ending";
        node.system.release();
      }
    }
  }

  update(delta: number) {
    if (!Number.isFinite(delta) || delta <= 0) return;
    const before = this.age;
    this.age += delta;
    for (const node of this.nodes) {
      if (
        node.state === "cancelled" ||
        node.startAt === null ||
        node.startAt > this.age
      )
        continue;
      if (node.system.age === 0) node.system.update(0, true);
      if (node.state === "waiting") node.state = "running";
      const activeDelta = this.age - Math.max(before, node.startAt);
      if (activeDelta > 0) node.system.update(activeDelta);
    }
    if (this.autoReplay && !this.released) {
      let hasEmitted = false;
      let complete = true;
      for (const node of this.replayNodes) {
        hasEmitted ||= node.system.spawned > 0;
        if (
          node.spec.continuous ||
          node.spec.lifecycle.endCap ||
          node.state === "waiting" ||
          node.system.count > 0 ||
          node.system.age < node.spec.lastEmissionTime
        )
          complete = false;
      }
      complete &&= hasEmitted;
      this.replayWait = complete ? this.replayWait + delta : 0;
      if (this.replayWait >= 0.75) this.reset();
    }
  }

  /**
   * Inherit transforms by value, then apply each system's own drivers and operators.
   * The callback can also apply preview charge/target inputs in Source coordinates.
   */
  placeControlPoints(
    place: (node: ParticleHierarchyNode) => void,
    snap: boolean,
  ) {
    for (const node of this.nodes) {
      for (let index = 0; index < node.controlPoints.length; index += 1) {
        const point = node.controlPoints[index];
        point.previousPosition.copy(point.position);
        point.previousRotation.copy(point.rotation);
        const inherited = node.parent?.controlPoints[index];
        if (inherited) {
          point.position.copy(inherited.position);
          point.rotation.copy(inherited.rotation);
        }
      }
      place(node);
      if (!node.spec.blockedBy)
        for (const operator of node.spec.preEmission)
          operator(node.controlPoints, node.system);
      if (snap)
        for (const point of node.controlPoints) {
          point.previousPosition.copy(point.position);
          point.previousRotation.copy(point.rotation);
        }
    }
  }
}
