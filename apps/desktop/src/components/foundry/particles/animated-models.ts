import * as THREE from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { createPreviewClip } from "@/lib/preview-animation";
import type { PreviewAnimation } from "@/types/generated/PreviewAnimation";
import { SOURCE_TO_GLTF } from "./attachments";
import { cloneParticleModelMaterial } from "./model-material";
import { particleModelTransform } from "./model-transform";
import { bool, fields, list, num, scalar, str, type Fields } from "./values";
import type { ParticleAssets } from "./assets";
import type { ParticleSimulation } from "./simulation";

interface Instance {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  materials: {
    material: THREE.Material;
    opacity: number;
    color?: THREE.Color;
  }[];
  skeletons: Set<THREE.Skeleton>;
}

/** Separate GPU-skinned poses share source geometry while keeping independent particle clocks. */
export class AnimatedParticleModels {
  readonly root = new THREE.Group();
  private readonly instances = new Map<number, Instance>();
  private readonly emissiveField: number | undefined;
  private readonly conversion = new THREE.Matrix4().makeRotationFromQuaternion(
    SOURCE_TO_GLTF.clone().invert(),
  );
  constructor(
    private readonly source: THREE.Group,
    private readonly animation: PreviewAnimation | THREE.AnimationClip,
    private readonly op: Fields,
    private readonly simulation: ParticleSimulation,
    private readonly assets: ParticleAssets,
  ) {
    const binding = list(op.m_MaterialVars)
      .map(fields)
      .find((binding) =>
        ["$SELFILLUMCOLOR", "g_vSelfIllumTint"].includes(
          str(binding.m_strVariable),
        ),
      );
    this.emissiveField = binding
      ? num(binding.m_nVariableField, 17)
      : undefined;
  }

  private create(): Instance {
    const model = clone(this.source);
    const root = new THREE.Group();
    root.matrixAutoUpdate = false;
    root.add(model);
    const materials: Instance["materials"] = [];
    const skeletons = new Set<THREE.Skeleton>();
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton);
      const sources = Array.isArray(object.material)
        ? object.material
        : [object.material];
      const copies = sources.map((source) =>
        cloneParticleModelMaterial(source, this.op, this.assets),
      );
      if (copies.some((material) => material === null)) {
        object.visible = false;
        for (const material of copies) material?.dispose();
        return;
      }
      const usable = copies.filter((material) => material !== null);
      for (const material of usable) {
        material.transparent = true;
        material.depthWrite = false;
        materials.push({
          material,
          opacity: material.opacity,
          color:
            material instanceof THREE.MeshBasicMaterial ||
            material instanceof THREE.MeshStandardMaterial
              ? material.color.clone()
              : undefined,
        });
      }
      object.material = Array.isArray(object.material) ? usable : usable[0];
      object.frustumCulled = !(object instanceof THREE.SkinnedMesh);
    });
    const mixer = new THREE.AnimationMixer(model);
    const clip =
      this.animation instanceof THREE.AnimationClip
        ? this.animation
        : createPreviewClip(model, this.animation);
    mixer.clipAction(clip).play();
    this.root.add(root);
    return { root, mixer, materials, skeletons };
  }

  update(fade: number) {
    const live = new Set(
      this.simulation.particles.map((particle) => particle.id),
    );
    for (const [id, instance] of this.instances)
      if (!live.has(id)) {
        this.release(instance);
        this.instances.delete(id);
      }
    const context = this.simulation.context;
    for (const particle of this.simulation.particles) {
      let instance = this.instances.get(particle.id);
      if (!instance) {
        if (this.instances.size >= 32) {
          this.assets.warnings.add(
            "Animated particle model instance limit reached",
          );
          break;
        }
        instance = this.create();
        this.instances.set(particle.id, instance);
      }
      context.particle = particle;
      const fps =
        ((this.animation instanceof THREE.AnimationClip
          ? (this.animation.tracks[0]?.times.length ?? 1)
          : this.animation.times.length) -
          1) /
        Math.max(this.animation.duration, 1e-6);
      let time = bool(this.op.m_bManualAnimFrame)
        ? particle.values[num(this.op.m_nManualFrameField, 38)] /
          Math.max(1, fps)
        : particle.age * scalar(this.op.m_flAnimationRate, context, 1);
      const duration = this.animation.duration;
      if (duration > 0)
        time = bool(this.op.m_bForceLoopingAnimation)
          ? ((time % duration) + duration) % duration
          : Math.max(0, Math.min(duration - 1e-6, time));
      instance.mixer.setTime(time);
      instance.root.matrix
        .copy(particleModelTransform(this.op, particle, context))
        .multiply(this.conversion);
      instance.root.matrixWorldNeedsUpdate = true;
      const alpha = THREE.MathUtils.clamp(
        particle.values[7] *
          particle.values[16] *
          fade *
          scalar(this.op.m_flAlphaScale, context, 1),
        0,
        1,
      );
      for (const { material, opacity, color } of instance.materials) {
        material.opacity = opacity * alpha;
        if (
          color &&
          (material instanceof THREE.MeshBasicMaterial ||
            material instanceof THREE.MeshStandardMaterial)
        ) {
          material.color.copy(color);
          if (
            this.emissiveField !== undefined &&
            material instanceof THREE.MeshBasicMaterial
          )
            material.color.multiply(
              new THREE.Color().setFromVector3(
                particle.vector(this.emissiveField),
              ),
            );
          if (!bool(this.op.m_bSuppressTint))
            material.color.multiply(
              new THREE.Color().setFromVector3(particle.vector(6)),
            );
        }
      }
    }
    context.particle = undefined;
  }

  private release(instance: Instance) {
    instance.mixer.stopAllAction();
    instance.mixer.uncacheRoot(instance.root.children[0]);
    instance.root.removeFromParent();
    for (const { material } of instance.materials) material.dispose();
    for (const skeleton of instance.skeletons) skeleton.dispose();
  }
  dispose() {
    for (const instance of this.instances.values()) this.release(instance);
    this.instances.clear();
    this.root.removeFromParent();
  }
}
