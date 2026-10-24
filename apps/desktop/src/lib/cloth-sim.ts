import * as THREE from "three";
import type {
  ViewerEffect,
  ViewerEffectContext,
} from "@/components/foundry/viewer-effects";
import type { PreviewCloth } from "@/types/generated/PreviewCloth";
import type { PreviewClothNodeBase } from "@/types/generated/PreviewClothNodeBase";

const STEP = 1 / 60;
const MAX_STEPS_PER_FRAME = 4;
const ITERATIONS = 4;
/** Velocity kept per step on top of each node's own damping; keeps the solver calm. */
const BASE_RETENTION = 0.985;
/** A static node jumping further than this in one frame is a cut, not motion. */
const TELEPORT_DISTANCE = 40;
/** Hard leash on any node's distance from its animated position. */
const MAX_STRAY = 48;

interface NodeState {
  bone: THREE.Bone | null;
  /** Read straight from the animated skeleton rather than derived from a parent. */
  driven: boolean;
  /** Bind pose relative to the parent node (or the model root). */
  relative: THREE.Matrix4;
  goal: THREE.Matrix4;
  goalPosition: THREE.Vector3;
  /** Where the goal was at the last simulation step. */
  stepGoal: THREE.Vector3;
  position: THREE.Vector3;
  previous: THREE.Vector3;
  children: number[];
}

const sanitize = (name: string) => THREE.PropertyBinding.sanitizeNodeName(name);

/**
 * Simulates a model's Source 2 cloth on top of whatever pose the animation
 * mixer produced, then writes the result into the cloth bones.
 */
export const createClothEffect =
  (cloth: PreviewCloth) =>
  ({ model }: Pick<ViewerEffectContext, "model">): ViewerEffect | null => {
    const nodes = cloth.nodes;
    // A dynamic node nothing holds up (no static node reachable through rods,
    // no pull toward its animation, no stray limit) would just fall; jiggle
    // bones authored that way follow the animation instead.
    const linked = nodes.map((): number[] => []);
    for (const {
      nodes: [a, b],
    } of cloth.rods) {
      linked[a]?.push(b);
      linked[b]?.push(a);
    }
    const anchored = new Set(
      nodes.flatMap((node, index) =>
        node.isStatic || node.animationVertexAttraction > 0 ? [index] : [],
      ),
    );
    for (const stray of cloth.strayRadii) anchored.add(stray.node);
    const frontier = [...anchored];
    while (frontier.length > 0) {
      for (const next of linked[frontier.pop() ?? 0] ?? []) {
        if (anchored.has(next)) continue;
        anchored.add(next);
        frontier.push(next);
      }
    }
    const pinned = nodes.map(
      (node, index) => node.isStatic || !anchored.has(index),
    );
    const bind = nodes.map((node) =>
      new THREE.Matrix4().compose(
        new THREE.Vector3(...node.bindPosition),
        new THREE.Quaternion(...node.bindRotation),
        new THREE.Vector3(1, 1, 1),
      ),
    );
    const state: NodeState[] = nodes.map((node, index) => {
      const bone = model.getObjectByName(sanitize(node.name));
      const parentBind = node.parent >= 0 ? bind[node.parent] : null;
      return {
        bone: bone instanceof THREE.Bone ? bone : null,
        driven:
          pinned[index] &&
          bone instanceof THREE.Bone &&
          !node.name.startsWith("$"),
        relative: parentBind
          ? parentBind.clone().invert().multiply(bind[index])
          : bind[index].clone(),
        goal: new THREE.Matrix4(),
        goalPosition: new THREE.Vector3(),
        stepGoal: new THREE.Vector3(),
        position: new THREE.Vector3(),
        previous: new THREE.Vector3(),
        children: [],
      };
    });
    if (!state.some((node, index) => node.bone && !pinned[index])) return null;
    nodes.forEach((node, index) => {
      if (node.parent >= 0 && !pinned[index])
        state[node.parent].children.push(index);
    });
    // Parents before children, so goals and bone writes can build on them.
    const depth = (index: number, seen = 0): number =>
      nodes[index].parent < 0 || seen > nodes.length
        ? 0
        : 1 + depth(nodes[index].parent, seen + 1);
    const order = nodes
      .map((_, index) => index)
      .sort((a, b) => depth(a) - depth(b));
    const written = order.filter(
      (index) => state[index].bone && !state[index].driven,
    );
    const restLocals = written.map((index) => {
      const bone = state[index].bone!;
      return {
        bone,
        position: bone.position.clone(),
        quaternion: bone.quaternion.clone(),
        scale: bone.scale.clone(),
      };
    });
    // The animated pose of each bone this effect overwrites. When the mixer is
    // paused it leaves our last write in place, so that is swapped back for
    // the pose it last produced before goals are read.
    const animatedLocals = restLocals.map((rest) => ({
      ...rest,
      position: rest.position.clone(),
      quaternion: rest.quaternion.clone(),
      scale: rest.scale.clone(),
      writtenPosition: new THREE.Vector3(Number.NaN, 0, 0),
      writtenQuaternion: new THREE.Quaternion(),
    }));

    const gravity = new THREE.Vector3(0, -1, 0);
    const scratch = new THREE.Vector3();
    const segment = new THREE.Vector3();
    const offset = new THREE.Vector3();
    const goal = new THREE.Vector3();
    const motion = new THREE.Vector3();
    const velocity = new THREE.Vector3();
    const ends = [new THREE.Vector3(), new THREE.Vector3()];
    const colliders = cloth.colliders.map((collider) => ({
      ...collider,
      local: collider.spheres.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    }));
    let initialized = false;
    let accumulator = 0;

    const updateGoals = () => {
      for (const local of animatedLocals) {
        const { bone } = local;
        if (
          bone.position.equals(local.writtenPosition) &&
          bone.quaternion.equals(local.writtenQuaternion)
        ) {
          bone.position.copy(local.position);
          bone.quaternion.copy(local.quaternion);
          bone.scale.copy(local.scale);
        } else {
          local.position.copy(bone.position);
          local.quaternion.copy(bone.quaternion);
          local.scale.copy(bone.scale);
        }
      }
      model.updateMatrixWorld(true);
      for (const index of order) {
        const node = state[index];
        const parent = nodes[index].parent;
        if (node.driven && node.bone) node.goal.copy(node.bone.matrixWorld);
        else if (parent >= 0)
          node.goal.multiplyMatrices(state[parent].goal, node.relative);
        // A node with no cloth parent hangs off its bone's own animated pose.
        else if (node.bone) node.goal.copy(node.bone.matrixWorld);
        else node.goal.multiplyMatrices(model.matrixWorld, node.relative);
        node.goalPosition.setFromMatrixPosition(node.goal);
      }
    };

    const reset = () => {
      for (const node of state) {
        node.position.copy(node.goalPosition);
        node.previous.copy(node.goalPosition);
        node.stepGoal.copy(node.goalPosition);
      }
    };

    const solveRods = () => {
      for (const rod of cloth.rods) {
        const [a, b] = rod.nodes;
        const staticA = pinned[a];
        const staticB = pinned[b];
        if (staticA && staticB) continue;
        let weightA = staticA ? 0 : staticB ? 1 : rod.weight0;
        let weightB = staticB ? 0 : staticA ? 1 : 1 - rod.weight0;
        const total = weightA + weightB;
        if (total <= 0) continue;
        weightA /= total;
        weightB /= total;
        segment.subVectors(state[b].position, state[a].position);
        const length = segment.length();
        if (length < 1e-6) continue;
        const target = THREE.MathUtils.clamp(
          length,
          rod.minDistance,
          rod.maxDistance,
        );
        if (target === length) continue;
        segment.multiplyScalar(((length - target) / length) * rod.relaxation);
        state[a].position.addScaledVector(segment, weightA);
        state[b].position.addScaledVector(segment, -weightB);
      }
    };

    const leash = (index: number, maxDistance: number, relaxation: number) => {
      const node = state[index];
      scratch.subVectors(node.position, node.goalPosition);
      const distance = scratch.length();
      if (distance <= maxDistance) return;
      scratch.multiplyScalar(
        ((distance - maxDistance) / distance) * relaxation,
      );
      node.position.sub(scratch);
    };

    const collide = () => {
      for (const collider of colliders) {
        const frame = state[collider.node].goal;
        ends[0].copy(collider.local[0]).applyMatrix4(frame);
        ends[1].copy(collider.local[1]).applyMatrix4(frame);
        segment.subVectors(ends[1], ends[0]);
        const lengthSquared = segment.lengthSq();
        const [radiusA, radiusB] = [
          collider.spheres[0][3],
          collider.spheres[1][3],
        ];
        nodes.forEach((node, index) => {
          if (pinned[index]) return;
          const position = state[index].position;
          const t =
            lengthSquared > 0
              ? THREE.MathUtils.clamp(
                  offset.subVectors(position, ends[0]).dot(segment) /
                    lengthSquared,
                  0,
                  1,
                )
              : 0;
          scratch.copy(ends[0]).addScaledVector(segment, t);
          const radius =
            THREE.MathUtils.lerp(radiusA, radiusB, t) + node.collisionRadius;
          offset.subVectors(position, scratch);
          const distance = offset.length();
          if (distance >= radius || distance < 1e-6) return;
          position.copy(scratch).addScaledVector(offset, radius / distance);
        });
      }
    };

    /** One fixed step; `fraction` is how far through this frame's goal motion it lands. */
    const step = (fraction: number, steps: number) => {
      nodes.forEach((node, index) => {
        const current = state[index];
        goal.lerpVectors(current.stepGoal, current.goalPosition, fraction);
        if (pinned[index]) {
          current.position.copy(goal);
          current.previous.copy(goal);
          return;
        }
        // This step's share of the animated motion, carried into the node.
        motion
          .subVectors(current.goalPosition, current.stepGoal)
          .multiplyScalar(node.animationForceAttraction / steps);
        const retention =
          BASE_RETENTION *
          (1 - THREE.MathUtils.clamp(node.damping * STEP, 0, 1));
        velocity
          .subVectors(current.position, current.previous)
          .multiplyScalar(retention);
        current.previous.copy(current.position);
        current.position
          .add(velocity)
          .add(motion)
          .addScaledVector(gravity, node.gravity * STEP * STEP)
          .lerp(
            goal,
            THREE.MathUtils.clamp(node.animationVertexAttraction, 0, 1),
          );
      });
      for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
        solveRods();
        for (const stray of cloth.strayRadii)
          leash(stray.node, stray.maxDistance, stray.relaxation);
        collide();
      }
      for (let index = 0; index < nodes.length; index += 1) {
        if (!pinned[index]) leash(index, MAX_STRAY, 1);
      }
    };

    const bases = new Map<number, PreviewClothNodeBase>();
    for (const base of cloth.nodeBases) {
      const adjustmentLength = new THREE.Quaternion(...base.qAdjust).lengthSq();
      if (
        [base.node, base.x0, base.x1, base.y0, base.y1].every(
          (index) =>
            Number.isInteger(index) && index >= 0 && index < state.length,
        ) &&
        base.qAdjust.every(Number.isFinite) &&
        Number.isFinite(adjustmentLength) &&
        adjustmentLength > 1e-8
      ) {
        bases.set(base.node, base);
      }
    }
    const frameX = new THREE.Vector3();
    const frameY = new THREE.Vector3();
    const frameZ = new THREE.Vector3();
    const frameMatrix = new THREE.Matrix4();
    const adjustment = new THREE.Quaternion();
    const goalFrame = new THREE.Quaternion();
    const solvedFrame = new THREE.Quaternion();
    const reconstructFrame = (
      base: PreviewClothNodeBase,
      solved: boolean,
      result: THREE.Quaternion,
    ) => {
      const key = solved ? "position" : "goalPosition";
      frameX.subVectors(state[base.x0][key], state[base.x1][key]);
      frameY.subVectors(state[base.y0][key], state[base.y1][key]);
      const lengthX = frameX.lengthSq();
      const lengthY = frameY.lengthSq();
      if (
        !Number.isFinite(lengthX) ||
        !Number.isFinite(lengthY) ||
        lengthX < 1e-8 ||
        lengthY < 1e-8
      )
        return false;
      frameX.normalize();
      frameY.normalize();
      frameZ.crossVectors(frameX, frameY);
      if (frameZ.lengthSq() < 1e-8) return false;
      frameZ.normalize();
      frameY.crossVectors(frameZ, frameX);
      adjustment.set(...base.qAdjust).normalize();
      result
        .setFromRotationMatrix(frameMatrix.makeBasis(frameX, frameY, frameZ))
        .multiply(adjustment)
        .normalize();
      return true;
    };

    const aim = new THREE.Quaternion();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const goalDirection = new THREE.Vector3();
    const simulatedDirection = new THREE.Vector3();
    const world = new THREE.Matrix4();
    const inverseParent = new THREE.Matrix4();

    const writeBones = () => {
      for (const index of written) {
        const node = state[index];
        const bone = node.bone!;
        node.goal.decompose(scratch, rotation, scale);
        const base = bases.get(index);
        if (
          base &&
          reconstructFrame(base, false, goalFrame) &&
          reconstructFrame(base, true, solvedFrame)
        ) {
          // Compare the solved frame with the animated bind frame. Applying
          // only their delta preserves the exported bone's rotation convention.
          aim.copy(solvedFrame).multiply(goalFrame.invert());
          rotation.premultiply(aim);
        } else if (node.children.length > 0) {
          goalDirection.set(0, 0, 0);
          simulatedDirection.set(0, 0, 0);
          for (const child of node.children) {
            goalDirection.add(state[child].goalPosition).sub(node.goalPosition);
            simulatedDirection.add(state[child].position).sub(node.position);
          }
          if (
            goalDirection.lengthSq() > 1e-8 &&
            simulatedDirection.lengthSq() > 1e-8
          ) {
            aim.setFromUnitVectors(
              goalDirection.normalize(),
              simulatedDirection.normalize(),
            );
            rotation.premultiply(aim);
          }
        }
        world.compose(node.position, rotation, scale);
        if (bone.parent) {
          inverseParent.copy(bone.parent.matrixWorld).invert();
          world.premultiply(inverseParent);
        }
        world.decompose(bone.position, bone.quaternion, bone.scale);
        bone.updateWorldMatrix(false, false);
      }
      for (const local of animatedLocals) {
        local.writtenPosition.copy(local.bone.position);
        local.writtenQuaternion.copy(local.bone.quaternion);
      }
    };

    return {
      reset() {
        updateGoals();
        reset();
        accumulator = 0;
        initialized = true;
      },
      update(delta) {
        updateGoals();
        if (!initialized) {
          reset();
          initialized = true;
        }
        const jumped = state.some(
          (node, index) =>
            pinned[index] &&
            node.goalPosition.distanceTo(node.stepGoal) > TELEPORT_DISTANCE,
        );
        if (jumped) reset();
        const elapsed = Number.isFinite(delta) ? Math.max(0, delta) : 0;
        accumulator = Math.min(
          accumulator + elapsed,
          STEP * MAX_STEPS_PER_FRAME,
        );
        const steps = Math.floor(accumulator / STEP);
        for (let index = 0; index < steps; index += 1) {
          step((index + 1) / steps, steps);
        }
        accumulator -= steps * STEP;
        if (steps > 0) {
          for (const node of state) node.stepGoal.copy(node.goalPosition);
        }
        writeBones();
      },
      dispose() {
        for (const rest of restLocals) {
          rest.bone.position.copy(rest.position);
          rest.bone.quaternion.copy(rest.quaternion);
          rest.bone.scale.copy(rest.scale);
        }
      },
    };
  };
