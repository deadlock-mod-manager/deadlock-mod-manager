import * as THREE from "three";
import {
  bool,
  cp,
  num,
  vector,
  type Fields,
  type Inputs,
  type Particle,
} from "./values";

export const particleModelTransform = (
  op: Fields,
  particle: Particle,
  context: Inputs,
) => {
  const normal = particle.vector(21).clone();
  const basis = new THREE.Matrix4();
  if (!bool(op.m_bIgnoreNormal) && normal.lengthSq() > 1e-12) {
    normal.normalize();
    const perpendicular = new THREE.Vector3(
      (1 - normal.z) * normal.y * normal.y + normal.z,
      0,
      -normal.x,
    )
      .projectOnPlane(normal)
      .normalize();
    const third = new THREE.Vector3().crossVectors(normal, perpendicular);
    if (bool(op.m_bOrientZ))
      basis.makeBasis(third, perpendicular.clone().negate(), normal);
    else basis.makeBasis(normal, perpendicular, third);
  }
  const local = vector(op.m_vecLocalRotation, context).multiplyScalar(
    Math.PI / 180,
  );
  const turn = new THREE.Matrix4()
    .makeRotationFromEuler(
      new THREE.Euler(
        particle.values[4],
        particle.values[20],
        particle.values[12],
        "ZYX",
      ),
    )
    .multiply(
      new THREE.Matrix4().makeRotationFromEuler(
        new THREE.Euler(local.z, local.x, local.y, "ZYX"),
      ),
    );
  const scale = vector(op.m_vecComponentScale, context, 1).multiplyScalar(
    bool(op.m_bIgnoreRadius) ? 1 : Math.max(0, particle.values[3]),
  );
  const scalePoint = num(op.m_nModelScaleCP, -1);
  if (scalePoint >= 0) scale.multiply(cp(context, scalePoint).position);
  const scaling = new THREE.Matrix4().makeScale(scale.x, scale.y, scale.z);
  const position = particle.vector(0);
  const matrix = new THREE.Matrix4()
    .makeTranslation(position.x, position.y, position.z)
    .multiply(basis);
  if (bool(op.m_bLocalScale)) matrix.multiply(turn).multiply(scaling);
  else matrix.multiply(scaling).multiply(turn);
  const offset = vector(op.m_vecLocalOffset, context);
  return matrix.multiply(
    new THREE.Matrix4().makeTranslation(offset.x, offset.y, offset.z),
  );
};
