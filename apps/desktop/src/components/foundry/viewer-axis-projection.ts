import { Quaternion, Vector3 } from "three";

const AXES: {
  direction: [number, number, number];
  label: string;
  color: string;
}[] = [
  { direction: [1, 0, 0], label: "X", color: "#d98d6a" },
  { direction: [0, 1, 0], label: "Y", color: "#e7d5a3" },
  { direction: [0, 0, 1], label: "Z", color: "#8fb0c9" },
  { direction: [-1, 0, 0], label: "", color: "#d98d6a" },
  { direction: [0, -1, 0], label: "", color: "#e7d5a3" },
  { direction: [0, 0, -1], label: "", color: "#8fb0c9" },
];

export const createViewerAxisProjection = () => {
  const axes = AXES.map((axis) => ({
    color: axis.color,
    label: axis.label,
    direction: new Vector3(...axis.direction),
    projected: new Vector3(),
  }));
  const previous = new Quaternion(0, 0, 0, 0);
  const inverse = new Quaternion();
  return {
    axes,
    update(rotation: Quaternion) {
      if (1 - Math.abs(previous.dot(rotation)) < 1e-8) return false;
      previous.copy(rotation);
      inverse.copy(rotation).invert();
      for (const axis of axes)
        axis.projected.copy(axis.direction).applyQuaternion(inverse);
      axes.sort((a, b) => a.projected.z - b.projected.z);
      return true;
    },
  };
};

export const pickViewerAxis = (
  axes: ReturnType<typeof createViewerAxisProjection>["axes"],
  x: number,
  y: number,
): Vector3 | null => {
  for (let i = axes.length - 1; i >= 0; i--) {
    const axis = axes[i];
    if (
      Math.hypot(x - axis.projected.x, y - axis.projected.y) <=
      (axis.label ? 0.26 : 0.17)
    )
      return axis.direction;
  }
  return null;
};
