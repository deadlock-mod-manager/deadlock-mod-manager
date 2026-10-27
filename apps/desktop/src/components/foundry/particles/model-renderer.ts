import * as THREE from "three";
import { SOURCE_TO_GLTF } from "./attachments";
import { bool, fields, list, scalar, str, type Fields } from "./values";
import { cloneParticleModelMaterial } from "./model-material";
import { particleModelTransform } from "./model-transform";
import { ParticleModelPoses } from "./model-poses";
import type { ParticleAssets } from "./assets";
import type { ParticleSimulation } from "./simulation";

export class ParticleModels {
  readonly root = new THREE.Group();
  private poses: ParticleModelPoses | null = null;
  private readonly instances: {
    mesh: THREE.InstancedMesh;
    local: THREE.Matrix4;
    alpha: THREE.InstancedBufferAttribute;
  }[] = [];
  constructor(
    private readonly op: Fields,
    private readonly simulation: ParticleSimulation,
    assets: ParticleAssets,
  ) {
    const reference = fields(list(op.m_ModelList)[0]),
      path = str(reference.m_model);
    if (
      bool(op.m_bAnimated) &&
      bool(op.m_bManualAnimFrame) &&
      assets.poseSource?.path.replace(/_c$/, "") === path.replace(/_c$/, "")
    ) {
      assets.warnings.add(
        `Manual model particle frames use captured preview poses: ${path}`,
      );
      this.poses = new ParticleModelPoses(
        assets.poseSource.model,
        op,
        simulation,
        assets,
      );
      this.root.add(this.poses.root);
      return;
    }
    if (bool(op.m_bAnimated))
      assets.warnings.add(
        `Animated particle model sequence unavailable: ${path}`,
      );
    const model = assets.models.get(path);
    if (!model) {
      assets.warnings.add(`Renderer model unavailable: ${path}`);
      return;
    }
    model.updateWorldMatrix(true, true);
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const sourceMaterials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      const copies = sourceMaterials.map((source) =>
        cloneParticleModelMaterial(source, op, assets),
      );
      if (copies.some((material) => material === null)) {
        for (const material of copies) material?.dispose();
        return;
      }
      const materials = copies.filter((material) => material !== null);
      for (const material of materials) {
        const previous = material.onBeforeCompile;
        material.onBeforeCompile = (shader, renderer) => {
          previous.call(material, shader, renderer);
          shader.vertexShader =
            "attribute float particleModelAlpha;varying float vParticleModelAlpha;\n" +
            shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\nvParticleModelAlpha=particleModelAlpha;",
          );
          shader.fragmentShader =
            "varying float vParticleModelAlpha;\n" + shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <alphatest_fragment>",
            "#include <alphatest_fragment>\ndiffuseColor.a*=vParticleModelAlpha;",
          );
        };
        material.transparent = true;
        material.depthWrite = false;
      }
      const geometry = object.geometry.clone();
      const alpha = new THREE.InstancedBufferAttribute(
        new Float32Array(512),
        1,
      );
      alpha.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute("particleModelAlpha", alpha);
      const mesh = new THREE.InstancedMesh(
        geometry,
        Array.isArray(object.material) ? materials : materials[0],
        512,
      );
      mesh.count = 0;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      const conversion = new THREE.Matrix4().makeRotationFromQuaternion(
        SOURCE_TO_GLTF.clone().invert(),
      );
      this.instances.push({
        mesh,
        alpha,
        local: conversion.multiply(object.matrixWorld),
      });
      this.root.add(mesh);
    });
  }
  update(_camera: THREE.Camera, _frame: THREE.Object3D, fade: number) {
    if (this.poses) {
      this.poses.update(fade);
      return;
    }
    const ctx = this.simulation.context;
    for (const { mesh, local, alpha } of this.instances) {
      mesh.count = this.simulation.particles.length;
      for (const [i, p] of this.simulation.particles.entries()) {
        ctx.particle = p;
        const matrix = particleModelTransform(this.op, p, ctx).multiply(local);
        mesh.setMatrixAt(i, matrix);
        const color = new THREE.Color().setFromVector3(p.vector(6));
        if (
          [
            "PARTICLE_COLOR_BLEND_MOD2X",
            "PARTICLE_COLOR_BLEND_MULTIPLY2X",
          ].includes(str(this.op.m_nColorBlendType))
        )
          color.setRGB(
            Math.min(1, color.r * 2),
            Math.min(1, color.g * 2),
            Math.min(1, color.b * 2),
          );
        mesh.setColorAt(
          i,
          bool(this.op.m_bSuppressTint) ? new THREE.Color(1, 1, 1) : color,
        );
        alpha.setX(
          i,
          THREE.MathUtils.clamp(
            p.values[7] *
              p.values[16] *
              fade *
              scalar(this.op.m_flAlphaScale, ctx, 1),
            0,
            1,
          ),
        );
      }
      mesh.instanceMatrix.needsUpdate = true;
      alpha.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    ctx.particle = undefined;
  }
  dispose() {
    this.root.removeFromParent();
    this.poses?.dispose();
    for (const { mesh } of this.instances) {
      for (const material of Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material])
        material.dispose();
      mesh.geometry.dispose();
      mesh.dispose();
    }
  }
}
