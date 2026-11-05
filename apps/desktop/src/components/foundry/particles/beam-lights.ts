import * as THREE from "three";
import { scalar, type Fields } from "./values";
import type { ParticleSimulation } from "./simulation";

/** Bounded point samples approximate a Source tube light without drawing extra beam geometry. */
export class ParticleBeamLights {
  readonly root = new THREE.Group();
  private readonly lights = [new THREE.PointLight(), new THREE.PointLight()];
  constructor(
    private readonly op: Fields,
    private readonly simulation: ParticleSimulation,
  ) {
    this.root.add(...this.lights);
  }
  update(_camera: THREE.Camera, frame: THREE.Object3D, fade: number) {
    const particles = this.simulation.particles;
    for (const light of this.lights) light.visible = particles.length > 0;
    if (!particles.length) return;
    const bounds = new THREE.Box3();
    const color = new THREE.Color(0, 0, 0);
    let alpha = 0;
    for (const particle of particles) {
      bounds.expandByPoint(particle.vector(0));
      const weight = Math.max(0, particle.values[7] * particle.values[16]);
      const tint = particle.vector(6);
      color.r += tint.x * weight;
      color.g += tint.y * weight;
      color.b += tint.z * weight;
      alpha += weight;
    }
    if (alpha > 0) color.multiplyScalar(1 / alpha);
    const size = bounds.getSize(new THREE.Vector3());
    const axis =
      size.x >= size.y && size.x >= size.z ? "x" : size.y >= size.z ? "y" : "z";
    const center = bounds.getCenter(new THREE.Vector3());
    const scale = frame.getWorldScale(new THREE.Vector3()).x;
    const context = this.simulation.context;
    const lumens =
      0.0254 *
      size[axis] *
      Math.max(0, scalar(this.op.m_flBrightnessLumensPerMeter, context, 1000));
    for (const [i, light] of this.lights.entries()) {
      light.position.copy(center);
      light.position[axis] += (i === 0 ? -0.25 : 0.25) * size[axis];
      light.color.copy(color);
      light.distance = Math.max(
        0.01,
        scalar(this.op.m_flRange, context, 512) * scale,
      );
      light.intensity =
        (lumens / (4 * Math.PI * this.lights.length)) *
        Math.min(1, alpha / particles.length) *
        fade *
        (scale / 0.0254) ** 2;
      light.decay = 2;
    }
  }
  dispose() {
    this.root.removeFromParent();
    this.root.clear();
  }
}
