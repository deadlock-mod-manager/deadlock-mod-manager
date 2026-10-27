import {
  Group,
  Matrix4,
  Object3D,
  Quaternion,
  Vector3,
  PropertyBinding,
} from "three";
import type { ParticleValue } from "@/types/generated/ParticleValue";
import {
  fields,
  list,
  num,
  str,
  vec,
  type Fields,
  type ControlPoint,
} from "./values";

export const SOURCE_TO_GLTF = new Quaternion().setFromAxisAngle(
  new Vector3(1, 0, 0),
  -Math.PI / 2,
);

/** Resolves Source attachment transforms against the currently animated GLB skeleton. */
export class ParticleAttachments {
  readonly root = new Group();
  private readonly nodes = new Map<string, Object3D>();
  private readonly inverse = new Matrix4();
  constructor(
    private readonly rig: Object3D,
    private readonly definitions: Fields,
  ) {
    this.root.name = "Source 2 particle frame";
    this.root.position.copy(rig.position);
    this.root.quaternion.copy(rig.quaternion).multiply(SOURCE_TO_GLTF);
    this.root.scale.copy(rig.scale);
    rig.traverse((node) => this.nodes.set(node.name.toLowerCase(), node));
    rig.parent?.add(this.root);
  }
  private anchor(name: string): Matrix4 {
    const data = fields(this.definitions[name]),
      names = list(data.m_influenceNames),
      offsets = list(data.m_vInfluenceOffsets ?? data.m_influenceOffsets),
      rotations = list(data.m_vInfluenceRotations ?? data.m_influenceRotations),
      weights = list(data.m_influenceWeights);
    if (names.length) {
      const result = new Matrix4().identity();
      let matched = false;
      for (
        let i = 0;
        i < Math.min(names.length, num(data.m_nInfluences, names.length));
        i++
      ) {
        const bone = this.nodes.get(
          PropertyBinding.sanitizeNodeName(str(names[i])).toLowerCase(),
        );
        if (!bone) continue;
        const offset = vec(offsets[i]).applyQuaternion(SOURCE_TO_GLTF),
          r = list(rotations[i]);
        const rotation = new Quaternion(
          num(r[0]),
          num(r[1]),
          num(r[2]),
          num(r[3], 1),
        );
        rotation
          .premultiply(SOURCE_TO_GLTF)
          .multiply(SOURCE_TO_GLTF.clone().invert());
        const matrix = new Matrix4()
          .compose(offset, rotation, new Vector3(1, 1, 1))
          .premultiply(bone.matrixWorld);
        if (!matched) {
          result.copy(matrix);
          matched = true;
        } else {
          const position = new Vector3()
            .setFromMatrixPosition(result)
            .lerp(new Vector3().setFromMatrixPosition(matrix), num(weights[i]));
          const q = new Quaternion()
            .setFromRotationMatrix(result)
            .slerp(
              new Quaternion().setFromRotationMatrix(matrix),
              num(weights[i]),
            );
          result.compose(position, q, new Vector3(1, 1, 1));
        }
      }
      if (matched) return result;
    }
    return (
      this.nodes.get(PropertyBinding.sanitizeNodeName(name).toLowerCase()) ??
      this.rig
    ).matrixWorld.clone();
  }
  update(controls: Map<number, ControlPoint>, drivers: ParticleValue[]) {
    this.rig.updateWorldMatrix(true, true);
    this.root.updateWorldMatrix(true, false);
    this.inverse.copy(this.root.matrixWorld).invert();
    for (const value of drivers) {
      const driver = fields(value),
        index = num(driver.m_iControlPoint);
      let point = controls.get(index);
      const fresh = !point;
      if (!point) {
        point = {
          position: new Vector3(),
          previous: new Vector3(),
          rotation: new Quaternion(),
        };
        controls.set(index, point);
      }
      point.previous.copy(point.position);
      const name = str(driver.m_attachmentName),
        matrix = name ? this.anchor(name) : this.rig.matrixWorld.clone();
      const offset = vec(driver.m_vecOffset).applyQuaternion(SOURCE_TO_GLTF);
      const localOffset = new Matrix4().makeTranslation(
        offset.x,
        offset.y,
        offset.z,
      );
      matrix
        .multiply(localOffset)
        .multiply(new Matrix4().makeRotationFromQuaternion(SOURCE_TO_GLTF))
        .premultiply(this.inverse);
      matrix.decompose(point.position, point.rotation, new Vector3());
      if (fresh) point.previous.copy(point.position);
    }
  }
  dispose() {
    this.root.removeFromParent();
  }
}
