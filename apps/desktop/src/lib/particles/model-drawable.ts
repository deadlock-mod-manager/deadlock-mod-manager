import * as THREE from "three";
import { particleDrawOrder, type ParticleDrawable } from "./drawables";
import type { ParticleSystem } from "./system";
import {
  FIELD,
  type ParticleDiagnostic,
  type SpriteRendererSpec,
} from "./types";

const MAX_MODEL_INSTANCES = 64;
const MAX_MODEL_MESHES = 24;
const MAX_INSTANCED_TRIANGLES = 500_000;
const GLTF_TO_SOURCE = new THREE.Matrix4().makeRotationX(Math.PI / 2);

const cloneMaterial = (source: THREE.Material) => {
  const material = source.clone();
  material.transparent = true;
  material.depthWrite = false;
  // Preserve the source material's shader extensions before adding opacity.
  material.onBeforeCompile = (shader, renderer) => {
    source.onBeforeCompile(shader, renderer);
    shader.vertexShader =
      `attribute float particleAlpha; varying float vParticleAlpha;\n${shader.vertexShader}`.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvParticleAlpha = particleAlpha;",
      );
    shader.fragmentShader =
      `varying float vParticleAlpha;\n${shader.fragmentShader}`.replace(
        "#include <color_fragment>",
        "#include <color_fragment>\ndiffuseColor.a *= vParticleAlpha;",
      );
  };
  material.customProgramCacheKey = () =>
    `${source.customProgramCacheKey()}:particle-alpha-v1`;
  return material;
};

/** Uses actual decoded model meshes; owns clones, never the caller's cached assets. */
export const modelDrawable = (
  system: ParticleSystem,
  spec: SpriteRendererSpec,
  assets: ReadonlyMap<string, THREE.Object3D>,
  parent: THREE.Object3D,
  report: (diagnostic: ParticleDiagnostic) => void,
): ParticleDrawable => {
  const meshes: {
    mesh: THREE.InstancedMesh;
    model: number;
    alpha: THREE.InstancedBufferAttribute;
  }[] = [];
  const capacity = Math.min(
    Math.max(system.spec.maxParticles, 1),
    MAX_MODEL_INSTANCES,
  );
  const paths = spec.models.slice(0, 12);
  let triangleBudget = MAX_INSTANCED_TRIANGLES;
  const diagnose = (detail: string) =>
    report({
      path: system.spec.path,
      stage: "renderer",
      className: "C_OP_RenderModels",
      code: "approximation",
      detail,
    });
  paths.forEach((path, modelIndex) => {
    const asset = assets.get(path);
    if (!asset) {
      diagnose(`model-asset:${path}`);
      return;
    }
    asset.updateMatrixWorld(true);
    asset.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const triangles =
        (object.geometry.index?.count ??
          object.geometry.getAttribute("position")?.count ??
          0) / 3;
      if (
        meshes.length >= MAX_MODEL_MESHES ||
        triangles * capacity > triangleBudget
      ) {
        diagnose(`model-geometry-budget:${path}`);
        return;
      }
      triangleBudget -= triangles * capacity;
      if (object instanceof THREE.SkinnedMesh)
        diagnose(`model-bind-pose:${path}`);
      const geometry = object.geometry.clone();
      geometry.applyMatrix4(
        new THREE.Matrix4().multiplyMatrices(
          GLTF_TO_SOURCE,
          object.matrixWorld,
        ),
      );
      const alpha = new THREE.InstancedBufferAttribute(
        new Float32Array(capacity),
        1,
      ).setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute("particleAlpha", alpha);
      const material = Array.isArray(object.material)
        ? object.material.map(cloneMaterial)
        : cloneMaterial(object.material);
      const mesh = new THREE.InstancedMesh(geometry, material, capacity);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.renderOrder = 10;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      parent.add(mesh);
      meshes.push({ mesh, model: modelIndex, alpha });
    });
  });
  if (system.spec.maxParticles > capacity) diagnose("model-instance-budget");
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  const axis = new THREE.Vector3(0, 0, 1);
  const tint: [number, number, number] = [1, 1, 1];
  const modelView = new THREE.Matrix4();
  const previousView = new THREE.Matrix4().makeScale(0, 0, 0);
  const order: number[] = [];
  return {
    setVisible(visible) {
      for (const { mesh } of meshes) mesh.visible = visible;
    },
    prepare(camera, dirty) {
      modelView.multiplyMatrices(camera.matrixWorldInverse, parent.matrixWorld);
      if (!dirty && previousView.equals(modelView)) return;
      previousView.copy(modelView);
      const positions = system.vector(FIELD.position);
      const colors = system.vector(FIELD.color);
      const radius = system.scalar(FIELD.radius);
      const roll = system.scalar(FIELD.roll);
      const alpha = system.scalar(FIELD.alpha);
      const alpha2 = system.scalar(spec.alpha2Field);
      particleDrawOrder(
        Math.min(system.count, capacity),
        positions,
        modelView,
        true,
        order,
      );
      for (const entry of meshes) {
        let slot = 0;
        for (const index of order) {
          if (index % paths.length !== entry.model) continue;
          const context = system.focus(index);
          position.fromArray(positions, index * 3);
          quaternion.setFromAxisAngle(axis, roll[index]);
          scale.setScalar(
            Math.max(radius[index] * spec.radiusScale.evaluate(context), 0),
          );
          matrix.compose(position, quaternion, scale);
          entry.mesh.setMatrixAt(slot, matrix);
          spec.colorScale.evaluate(context, tint);
          const bright = spec.overbright.evaluate(context);
          color.setRGB(
            colors[index * 3] * tint[0] * bright,
            colors[index * 3 + 1] * tint[1] * bright,
            colors[index * 3 + 2] * tint[2] * bright,
          );
          entry.mesh.setColorAt(slot, color);
          entry.alpha.setX(
            slot,
            Math.min(
              Math.max(
                alpha[index] *
                  alpha2[index] *
                  spec.alphaScale.evaluate(context),
                0,
              ),
              1,
            ),
          );
          slot += 1;
        }
        entry.mesh.count = slot;
        entry.mesh.instanceMatrix.needsUpdate = true;
        if (entry.mesh.instanceColor)
          entry.mesh.instanceColor.needsUpdate = true;
        entry.alpha.needsUpdate = true;
      }
    },
    dispose() {
      for (const { mesh } of meshes) {
        mesh.removeFromParent();
        mesh.geometry.dispose();
        for (const material of Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material])
          material.dispose();
        mesh.dispose();
      }
    },
  };
};
