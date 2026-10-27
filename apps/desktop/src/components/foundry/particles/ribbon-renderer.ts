import * as THREE from "three";
import { num, scalar, type Fields } from "./values";
import type { ParticleSimulation } from "./simulation";
import type { ParticleAssets } from "./assets";
import {
  particleMaterial,
  RIBBON_VERTEX,
  updateMaterial,
} from "./particle-material";

export class ParticleRibbon {
  readonly root = new THREE.Group();
  private readonly geometry = new THREE.BufferGeometry();
  private readonly mesh: THREE.Mesh<
    THREE.BufferGeometry,
    THREE.ShaderMaterial
  > | null;
  private readonly positions = new THREE.Float32BufferAttribute(
    new Float32Array(512 * 8 * 2 * 3),
    3,
  );
  private readonly colors = new THREE.Float32BufferAttribute(
    new Float32Array(512 * 8 * 2 * 4),
    4,
  );
  private readonly uvs = new THREE.Float32BufferAttribute(
    new Float32Array(512 * 8 * 2 * 2),
    2,
  );
  constructor(
    private readonly op: Fields,
    private readonly simulation: ParticleSimulation,
    assets: ParticleAssets,
  ) {
    const material = particleMaterial(op, assets, RIBBON_VERTEX);
    if (!material) {
      this.mesh = null;
      return;
    }
    this.geometry.setAttribute("position", this.positions);
    this.geometry.setAttribute("rgba", this.colors);
    this.geometry.setAttribute("uv", this.uvs);
    const indices: number[] = [];
    for (let i = 0; i < 512 * 8 - 1; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geometry.setIndex(indices);
    this.positions.setUsage(THREE.DynamicDrawUsage);
    this.colors.setUsage(THREE.DynamicDrawUsage);
    this.uvs.setUsage(THREE.DynamicDrawUsage);
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
    this.root.add(this.mesh);
  }
  update(camera: THREE.Camera, frame: THREE.Object3D, fade: number) {
    if (!this.mesh) return;
    const particles = this.simulation.particles,
      ctx = this.simulation.context;
    if (particles.length < 2) {
      this.geometry.setDrawRange(0, 0);
      return;
    }
    const points = particles.map((p) => p.vector(0));
    const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
    const subdivisions = Math.round(
        THREE.MathUtils.clamp(num(this.op.m_nMinTesselation, 1), 1, 7),
      ),
      count = (particles.length - 1) * subdivisions + 1;
    const cameraPosition = frame.worldToLocal(
      camera.getWorldPosition(new THREE.Vector3()),
    );
    const worldSize = Math.max(
        0.0001,
        scalar(this.op.m_flTextureVWorldSize, ctx, 10),
      ),
      scroll =
        scalar(this.op.m_flTextureVScrollRate, ctx) * this.simulation.age +
        scalar(this.op.m_flTextureVOffset, ctx);
    let distance = 0,
      previous: THREE.Vector3 | null = null;
    for (let i = 0; i < count; i++) {
      const t = i / Math.max(1, count - 1),
        position = curve.getPoint(t),
        tangent = curve.getTangent(t);
      const index = t * (particles.length - 1),
        p = particles[Math.floor(index)],
        next = particles[Math.min(particles.length - 1, Math.floor(index) + 1)],
        fraction = index - Math.floor(index);
      const width = Math.max(
        0,
        THREE.MathUtils.lerp(p.values[3], next.values[3], fraction),
      );
      const axis = new THREE.Vector3()
        .crossVectors(tangent, cameraPosition.clone().sub(position))
        .normalize()
        .multiplyScalar(width);
      const a = position.clone().sub(axis),
        b = position.clone().add(axis),
        color = p.vector(6).clone().lerp(next.vector(6), fraction),
        alpha = THREE.MathUtils.lerp(
          p.values[7] * p.values[16],
          next.values[7] * next.values[16],
          fraction,
        );
      if (previous) distance += position.distanceTo(previous);
      previous = position;
      this.positions.setXYZ(i * 2, a.x, a.y, a.z);
      this.positions.setXYZ(i * 2 + 1, b.x, b.y, b.z);
      this.colors.setXYZW(i * 2, color.x, color.y, color.z, alpha);
      this.colors.setXYZW(i * 2 + 1, color.x, color.y, color.z, alpha);
      this.uvs.setXY(i * 2, 0, distance / worldSize + scroll);
      this.uvs.setXY(i * 2 + 1, 1, distance / worldSize + scroll);
    }
    this.geometry.setDrawRange(0, (count - 1) * 6);
    this.positions.needsUpdate =
      this.colors.needsUpdate =
      this.uvs.needsUpdate =
        true;
    updateMaterial(this.mesh.material, this.op, ctx, fade);
  }
  dispose() {
    this.root.removeFromParent();
    this.geometry.dispose();
    this.mesh?.material.dispose();
  }
}
