import * as THREE from "three";
import type { ParticleHierarchyNode } from "./hierarchy";

const MAX_MARKERS = 64;

/** Two bounded draw calls for position dots and RGB attachment orientation axes. */
export const createControlPointMarkers = (parent: THREE.Object3D) => {
  const group = new THREE.Group();
  group.visible = false;
  parent.add(group);
  const dots = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1.4, 8, 6),
    new THREE.MeshBasicMaterial({ depthTest: false }),
    MAX_MARKERS,
  );
  dots.frustumCulled = false;
  dots.renderOrder = 30;
  group.add(dots);
  const positions = new Float32Array(MAX_MARKERS * 18);
  const colors = new Float32Array(MAX_MARKERS * 18);
  for (let marker = 0; marker < MAX_MARKERS; marker += 1)
    for (let axis = 0; axis < 3; axis += 1)
      for (let end = 0; end < 2; end += 1)
        colors[marker * 18 + axis * 6 + end * 3 + axis] = 1;
  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3).setUsage(
    THREE.DynamicDrawUsage,
  );
  geometry.setAttribute("position", positionAttribute);
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const axes = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false }),
  );
  axes.frustumCulled = false;
  axes.renderOrder = 30;
  group.add(axes);
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  const end = new THREE.Vector3();
  const scale = new THREE.Vector3(1, 1, 1);
  return {
    prepare(
      nodes: ParticleHierarchyNode[],
      visible: boolean,
      targetControlPoint: number,
      isolatedPath: string | null,
    ) {
      group.visible = visible;
      if (!visible) return;
      let slot = 0;
      for (const node of nodes) {
        if (isolatedPath && node.spec.path !== isolatedPath) continue;
        const indices = new Set([
          0,
          targetControlPoint,
          ...node.spec.drivers.map((driver) => driver.controlPoint),
        ]);
        for (const index of indices) {
          const point = node.controlPoints[index];
          if (!point || slot >= MAX_MARKERS) continue;
          matrix.compose(point.position, point.rotation, scale);
          dots.setMatrixAt(slot, matrix);
          color.setHSL((index * 0.137) % 1, 0.8, 0.6);
          dots.setColorAt(slot, color);
          for (let axis = 0; axis < 3; axis += 1) {
            end
              .set(0, 0, 0)
              .setComponent(axis, 6)
              .applyQuaternion(point.rotation)
              .add(point.position);
            point.position.toArray(positions, slot * 18 + axis * 6);
            end.toArray(positions, slot * 18 + axis * 6 + 3);
          }
          slot += 1;
        }
      }
      dots.count = slot;
      dots.instanceMatrix.needsUpdate = true;
      if (dots.instanceColor) dots.instanceColor.needsUpdate = true;
      geometry.setDrawRange(0, slot * 6);
      positionAttribute.needsUpdate = true;
    },
    dispose() {
      group.removeFromParent();
      dots.geometry.dispose();
      dots.material.dispose();
      dots.dispose();
      geometry.dispose();
      axes.material.dispose();
    },
  };
};
