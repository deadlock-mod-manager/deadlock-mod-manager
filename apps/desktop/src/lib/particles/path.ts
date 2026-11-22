import * as THREE from "three";
import { numberOf, numbersOf, object } from "./definition";
import { type JsonValue } from "./json";
import { type ControlPoint } from "./types";

/**
 * Where a particle sits along its sequential path, 0 at the start and 1 at
 * the end. Not a Source attribute: a private slot past their range, which
 * ropes sort by so a beam draws from end to end.
 */
export const PATH_PROGRESS = 1000;

/**
 * `CPathParameters`: a curve between two control points through a mid point.
 * The random bulge is left out; it would bend every beam the same way.
 */
export interface PathParams {
  start: number;
  end: number;
  midPoint: number;
  startOffset: THREE.Vector3;
  midOffset: THREE.Vector3;
  endOffset: THREE.Vector3;
}

const vector = (value: JsonValue | undefined) => {
  const [x = 0, y = 0, z = 0] = numbersOf(value, [0, 0, 0]);
  return new THREE.Vector3(x, y, z);
};

export const parsePathParams = (value: JsonValue | undefined): PathParams => {
  const params = object(value);
  return {
    start: numberOf(params.m_nStartControlPointNumber, 0),
    end: numberOf(params.m_nEndControlPointNumber, 0),
    midPoint: numberOf(params.m_flMidPoint, 0.5),
    startOffset: vector(params.m_vStartPointOffset),
    midOffset: vector(params.m_vMidPointOffset),
    endOffset: vector(params.m_vEndOffset),
  };
};

const from = new THREE.Vector3();
const to = new THREE.Vector3();
const middle = new THREE.Vector3();

/** The point `progress` of the way along `path`. */
export const pathPoint = (
  path: PathParams,
  controlPoint: (index: number) => ControlPoint,
  progress: number,
  out: THREE.Vector3,
) => {
  from.copy(controlPoint(path.start).position).add(path.startOffset);
  to.copy(controlPoint(path.end).position).add(path.endOffset);
  middle.lerpVectors(from, to, path.midPoint).add(path.midOffset);
  const t = Math.min(Math.max(progress, 0), 1);
  const u = 1 - t;
  return out.set(
    u * u * from.x + 2 * u * t * middle.x + t * t * to.x,
    u * u * from.y + 2 * u * t * middle.y + t * t * to.y,
    u * u * from.z + 2 * u * t * middle.z + t * t * to.z,
  );
};
