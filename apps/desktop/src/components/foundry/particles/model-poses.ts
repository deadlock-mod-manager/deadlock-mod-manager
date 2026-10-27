import * as THREE from "three";
import { SOURCE_TO_GLTF } from "./attachments";
import { cloneParticleModelMaterial } from "./model-material";
import { particleModelTransform } from "./model-transform";
import type { ParticleAssets } from "./assets";
import type { ParticleSimulation } from "./simulation";
import { bool, scalar, str, type Fields } from "./values";

export class ParticleModelPoses {
  readonly root = new THREE.Group();
  private readonly poses = new Map<
    number,
    {
      root: THREE.Group;
      materials: {
        material: THREE.Material;
        opacity: number;
        color: THREE.Color | null;
      }[];
    }
  >();
  constructor(
    private readonly owner: THREE.Object3D,
    private readonly op: Fields,
    private readonly simulation: ParticleSimulation,
    private readonly assets: ParticleAssets,
  ) {}
  private capture() {
    this.owner.updateWorldMatrix(true, true);
    const inverse = new THREE.Matrix4()
      .makeRotationFromQuaternion(SOURCE_TO_GLTF.clone().invert())
      .multiply(this.owner.matrixWorld.clone().invert());
    const root = new THREE.Group();
    const materials: {
      material: THREE.Material;
      opacity: number;
      color: THREE.Color | null;
    }[] = [];
    this.owner.traverseVisible((object) => {
      if (
        !(object instanceof THREE.Mesh) ||
        object instanceof THREE.InstancedMesh ||
        object.userData.previewOutline === true
      )
        return;
      const sourceMaterials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      const copies = sourceMaterials.map((material) =>
        cloneParticleModelMaterial(material, this.op, this.assets),
      );
      if (copies.some((material) => material === null)) {
        for (const material of copies) material?.dispose();
        return;
      }
      const usable = copies.filter((material) => material !== null);
      const geometry = object.geometry.clone();
      const positions = geometry.getAttribute("position");
      const transform = inverse.clone().multiply(object.matrixWorld);
      const point = new THREE.Vector3();
      for (let i = 0; i < positions.count; i++) {
        object.getVertexPosition(i, point).applyMatrix4(transform);
        positions.setXYZ(i, point.x, point.y, point.z);
      }
      positions.needsUpdate = true;
      geometry.deleteAttribute("skinIndex");
      geometry.deleteAttribute("skinWeight");
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      for (const material of usable) {
        material.transparent = true;
        material.depthWrite = false;
        material.alphaTest = 0;
        material.stencilWrite = false;
        materials.push({
          material,
          opacity: material.opacity,
          color:
            material instanceof THREE.MeshStandardMaterial ||
            material instanceof THREE.MeshBasicMaterial
              ? material.color.clone()
              : null,
        });
      }
      root.add(
        new THREE.Mesh(
          geometry,
          Array.isArray(object.material) ? usable : usable[0],
        ),
      );
    });
    this.root.add(root);
    return { root, materials };
  }
  update(fade: number) {
    const live = new Set(
      this.simulation.particles.map((particle) => particle.id),
    );
    for (const [id, pose] of this.poses)
      if (!live.has(id)) {
        this.disposePose(pose);
        this.poses.delete(id);
      }
    const context = this.simulation.context;
    for (const particle of this.simulation.particles) {
      let pose = this.poses.get(particle.id);
      if (!pose) {
        if (this.poses.size >= 32) {
          this.assets.warnings.add(
            "Animated model particle pose limit reached",
          );
          break;
        }
        pose = this.capture();
        this.poses.set(particle.id, pose);
      }
      context.particle = particle;
      pose.root.matrix.copy(particleModelTransform(this.op, particle, context));
      pose.root.matrixAutoUpdate = false;
      const alpha = THREE.MathUtils.clamp(
        particle.values[7] *
          particle.values[16] *
          fade *
          scalar(this.op.m_flAlphaScale, context, 1),
        0,
        1,
      );
      const tint = particle.vector(6).clone();
      if (
        [
          "PARTICLE_COLOR_BLEND_MOD2X",
          "PARTICLE_COLOR_BLEND_MULTIPLY2X",
        ].includes(str(this.op.m_nColorBlendType))
      )
        tint.multiplyScalar(2).clampScalar(0, 1);
      for (const { material, opacity, color } of pose.materials) {
        material.opacity = opacity * alpha;
        if (
          color &&
          (material instanceof THREE.MeshStandardMaterial ||
            material instanceof THREE.MeshBasicMaterial)
        )
          material.color
            .copy(color)
            .multiply(
              bool(this.op.m_bSuppressTint)
                ? new THREE.Color(1, 1, 1)
                : new THREE.Color().setFromVector3(tint),
            );
      }
    }
    context.particle = undefined;
  }
  private disposePose(pose: {
    root: THREE.Group;
    materials: { material: THREE.Material }[];
  }) {
    pose.root.removeFromParent();
    pose.root.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
    for (const { material } of pose.materials) material.dispose();
  }
  dispose() {
    for (const pose of this.poses.values()) this.disposePose(pose);
    this.poses.clear();
    this.root.removeFromParent();
  }
}
