import type { Vector3 } from "three";

export interface ParticleBurst {
  root: string;
  interval: number;
  count: number;
  speed: number;
  attachment: string;
  distance?: number;
  spawnRadius?: number;
  position?: Vector3;
  onImpact?: (position: Vector3) => void;
}
