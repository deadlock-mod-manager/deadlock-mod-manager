import * as THREE from "three";
import { bool, num, scalar, str, type Fields, type Particle } from "./values";
import { layers } from "./texture-layers";
import type { ParticleSimulation } from "./simulation";
import type { ParticleAssets } from "./assets";
import {
  particleMaterial,
  SPRITE_VERTEX,
  updateMaterial,
} from "./particle-material";

export class ParticleSprites {
  readonly root = new THREE.Group();
  private readonly geometry = new THREE.InstancedBufferGeometry();
  private readonly mesh: THREE.Mesh<
    THREE.InstancedBufferGeometry,
    THREE.ShaderMaterial
  > | null;
  private readonly attributes: Map<string, THREE.InstancedBufferAttribute> =
    new Map();
  constructor(
    private readonly op: Fields,
    private readonly simulation: ParticleSimulation,
    private readonly assets: ParticleAssets,
  ) {
    const material = particleMaterial(op, assets, SPRITE_VERTEX);
    if (!material) {
      this.mesh = null;
      return;
    }
    this.geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0],
        3,
      ),
    );
    this.geometry.setIndex([0, 1, 2, 0, 2, 3]);
    for (const [name, size] of Object.entries({
      center: 3,
      axisX: 3,
      axisY: 3,
      rgba: 4,
      rect0: 4,
      rect1: 4,
      rect2: 4,
      rect3: 4,
      rect4: 4,
    })) {
      const attribute = new THREE.InstancedBufferAttribute(
        new Float32Array(512 * size),
        size,
      );
      attribute.setUsage(THREE.DynamicDrawUsage);
      this.attributes.set(name, attribute);
      this.geometry.setAttribute(name, attribute);
    }
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
    this.root.add(this.mesh);
  }
  private rect(layer: number, p: Particle): [number, number, number, number] {
    const refs = layers(this.op),
      path = str(refs[layer]?.m_hTexture, str(this.op.m_hTexture));
    const sheet = this.assets.textures.get(path)?.sheet;
    const sequence =
      sheet?.sequences[Math.trunc(p.values[layer > 0 ? 13 : 9])] ??
      sheet?.sequences[0];
    if (!sequence?.length) return [0, 0, 1, 1];
    const rate = scalar(
      this.op.m_flAnimationRate,
      this.simulation.context,
      0.1,
    );
    const duration = sequence.reduce(
      (sum, frame) => sum + Math.max(0.001, frame.duration),
      0,
    );
    const age =
      str(this.op.m_nAnimationType) === "ANIMATION_TYPE_FIT_LIFETIME"
        ? p.age / Math.max(0.001, p.values[1])
        : p.age;
    let time = age * rate * (bool(this.op.m_bAnimateInFPS) ? 1 : duration);
    time = ((time % duration) + duration) % duration;
    for (const frame of sequence) {
      time -= Math.max(0.001, frame.duration);
      if (time <= 0)
        return [frame.min[0], frame.min[1], frame.max[0], frame.max[1]];
    }
    return [0, 0, 1, 1];
  }
  update(camera: THREE.Camera, frame: THREE.Object3D, fade: number) {
    if (!this.mesh) return;
    const ctx = this.simulation.context;
    frame.updateWorldMatrix(true, false);
    const rotation = frame
      .getWorldQuaternion(new THREE.Quaternion())
      .invert()
      .multiply(camera.getWorldQuaternion(new THREE.Quaternion()));
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(rotation),
      up = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation),
      view = new THREE.Vector3(0, 0, 1).applyQuaternion(rotation);
    this.geometry.instanceCount = this.simulation.particles.length;
    for (const [i, p] of this.simulation.particles.entries()) {
      ctx.particle = p;
      const radius = Math.max(
        0,
        p.values[3] * scalar(this.op.m_flRadiusScale, ctx, 1),
      );
      let x = right.clone(),
        y = up.clone(),
        center = p.vector(0).clone();
      const orientation = str(this.op.m_nOrientationType);
      if (str(this.op["_class"]) === "C_OP_RenderTrails") {
        const trail = p.velocity
          .clone()
          .multiplyScalar(Math.max(0.001, p.values[10]));
        if (trail.lengthSq() < 0.001) trail.copy(p.vector(0)).sub(p.vector(2));
        const length = THREE.MathUtils.clamp(
          trail.length(),
          scalar(this.op.m_flMinLength, ctx),
          scalar(this.op.m_flMaxLength, ctx, 2000),
        );
        y.copy(trail)
          .normalize()
          .multiplyScalar(length * 0.5);
        x.crossVectors(trail, view).normalize().multiplyScalar(radius);
        center.addScaledVector(trail, -0.5);
      } else {
        if (orientation === "PARTICLE_ORIENTATION_WORLD_Z_ALIGNED") {
          x.set(0, -1, 0);
          y.set(1, 0, 0);
        } else if (orientation === "PARTICLE_ORIENTATION_SCREEN_Z_ALIGNED") {
          y.set(0, 0, 1);
          x.crossVectors(y, view.clone().negate());
        } else if (
          orientation === "PARTICLE_ORIENTATION_ALIGN_TO_PARTICLE_NORMAL"
        ) {
          const normal = p
            .vector(num(this.op.m_nVectorFieldForOrientation, 21))
            .clone()
            .normalize();
          const reference =
            Math.abs(normal.z) > 0.1
              ? new THREE.Vector3(0, -1, 0)
              : new THREE.Vector3(0, 0, 1);
          y.crossVectors(normal, reference).normalize();
          x.crossVectors(y, normal);
        }
        const angle = p.values[4],
          c = Math.cos(angle),
          s = Math.sin(angle),
          old = x.clone();
        x.multiplyScalar(c).addScaledVector(y, s);
        y.multiplyScalar(c).addScaledVector(old, -s);
        x.multiplyScalar(radius);
        y.multiplyScalar(radius);
      }
      this.attributes.get("center")?.setXYZ(i, center.x, center.y, center.z);
      this.attributes.get("axisX")?.setXYZ(i, x.x, x.y, x.z);
      this.attributes.get("axisY")?.setXYZ(i, y.x, y.y, y.z);
      const color = p.vector(6),
        alpha = Math.max(0, p.values[7] * p.values[16]);
      this.attributes.get("rgba")?.setXYZW(i, color.x, color.y, color.z, alpha);
      for (let layer = 0; layer < 5; layer++)
        this.attributes.get(`rect${layer}`)?.setXYZW(i, ...this.rect(layer, p));
    }
    ctx.particle = undefined;
    for (const attribute of this.attributes.values())
      attribute.needsUpdate = true;
    updateMaterial(this.mesh.material, this.op, ctx, fade);
  }
  dispose() {
    this.root.removeFromParent();
    this.geometry.dispose();
    this.mesh?.material.dispose();
  }
}
