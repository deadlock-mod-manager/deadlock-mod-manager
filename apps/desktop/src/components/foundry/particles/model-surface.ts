import * as THREE from "three";
import type { SurfacePoint } from "./values";

/** Samples the current skinned surface; the stored barycentric point can follow animation. */
export class ModelSurface {
  private readonly meshes: {
    mesh: THREE.Mesh;
    areas: Float32Array;
    area: number;
  }[] = [];
  private area = 0;
  constructor(
    rig: THREE.Object3D,
    private readonly frame: THREE.Object3D,
  ) {
    rig.traverse((object) => {
      if (
        !(object instanceof THREE.Mesh) ||
        object instanceof THREE.InstancedMesh
      )
        return;
      const positions = object.geometry.getAttribute("position"),
        indices = object.geometry.index;
      if (!positions) return;
      const count = Math.floor((indices?.count ?? positions.count) / 3),
        areas = new Float32Array(count);
      const a = new THREE.Vector3(),
        b = new THREE.Vector3(),
        c = new THREE.Vector3();
      let sum = 0;
      for (let i = 0; i < count; i++) {
        const at = (corner: number) =>
          indices ? indices.getX(i * 3 + corner) : i * 3 + corner;
        a.fromBufferAttribute(positions, at(0));
        b.fromBufferAttribute(positions, at(1));
        c.fromBufferAttribute(positions, at(2));
        sum += b.sub(a).cross(c.sub(a)).length() * 0.5;
        areas[i] = sum;
      }
      if (sum > 0) {
        this.meshes.push({ mesh: object, areas, area: sum });
        this.area += sum;
      }
    });
  }
  sample(random: () => number): SurfacePoint | null {
    let pick = random() * this.area;
    const data = this.meshes.find((item) => {
      pick -= item.area;
      return pick <= 0;
    });
    if (!data) return null;
    const area = pick + data.area;
    let low = 0,
      high = data.areas.length - 1;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (data.areas[mid] < area) low = mid + 1;
      else high = mid;
    }
    const indices = data.mesh.geometry.index,
      at = (corner: number) =>
        indices ? indices.getX(low * 3 + corner) : low * 3 + corner;
    const u = Math.sqrt(random()),
      v = random(),
      weights = [1 - u, u * (1 - v), u * v];
    const read = () => {
      const points = weights.map((_, i) =>
        data.mesh
          .getVertexPosition(at(i), new THREE.Vector3())
          .applyMatrix4(data.mesh.matrixWorld),
      );
      const position = points[0]
        .clone()
        .multiplyScalar(weights[0])
        .addScaledVector(points[1], weights[1])
        .addScaledVector(points[2], weights[2]);
      const normal = points[1]
        .clone()
        .sub(points[0])
        .cross(points[2].clone().sub(points[0]))
        .normalize();
      this.frame.worldToLocal(position);
      normal.transformDirection(this.frame.matrixWorld.clone().invert());
      return { position, normal };
    };
    const point = read();
    return {
      ...point,
      read: () => read().position,
      previous: point.position.clone(),
    };
  }
}
