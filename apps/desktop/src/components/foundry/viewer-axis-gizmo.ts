import { Quaternion, Vector3, type Camera } from "three";

const SVG_NS = "http://www.w3.org/2000/svg";
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

/** SVG keeps the camera overlay out of the model's WebGL render targets. */
export const createViewerAxisGizmo = (
  container: HTMLDivElement,
  camera: Camera,
  onDirection: (direction: Vector3) => void,
) => {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "-1.6 -1.6 3.2 3.2");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("aria-hidden", "true");
  const lines = document.createElementNS(SVG_NS, "g");
  const handles = document.createElementNS(SVG_NS, "g");
  svg.append(lines, handles);
  container.append(svg);

  const axes = AXES.map((axis) => {
    const direction = new Vector3(...axis.direction);
    const group = document.createElementNS(SVG_NS, "g");
    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("r", axis.label ? "0.26" : "0.17");
    circle.setAttribute("fill", axis.label ? axis.color : "none");
    circle.setAttribute("stroke", axis.color);
    circle.setAttribute("stroke-width", "0.06");
    group.setAttribute("opacity", axis.label ? "1" : "0.55");
    group.append(circle);
    const line = axis.label ? document.createElementNS(SVG_NS, "line") : null;
    if (line) {
      line.setAttribute("stroke", axis.color);
      line.setAttribute("stroke-width", "0.04");
      line.setAttribute("opacity", "0.8");
      lines.append(line);
      const text = document.createElementNS(SVG_NS, "text");
      text.textContent = axis.label;
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dy", "0.13");
      text.setAttribute("font-size", "0.4");
      text.setAttribute("font-weight", "bold");
      text.setAttribute("fill", "#1a1712");
      group.append(text);
    }
    const pick = (event: PointerEvent) => {
      event.stopPropagation();
      onDirection(direction);
    };
    group.addEventListener("pointerdown", pick);
    handles.append(group);
    return { direction, group, line, pick, projected: new Vector3() };
  });
  const previousRotation = new Quaternion(0, 0, 0, 0);
  const inverseRotation = new Quaternion();
  return {
    update() {
      if (previousRotation.equals(camera.quaternion)) return;
      previousRotation.copy(camera.quaternion);
      inverseRotation.copy(camera.quaternion).invert();
      for (const axis of axes) {
        const point = axis.projected
          .copy(axis.direction)
          .applyQuaternion(inverseRotation);
        axis.group.setAttribute(
          "transform",
          `translate(${point.x},${-point.y})`,
        );
        axis.line?.setAttribute("x2", String(point.x * 0.8));
        axis.line?.setAttribute("y2", String(-point.y * 0.8));
      }
      for (const axis of [...axes].sort(
        (a, b) => a.projected.z - b.projected.z,
      ))
        handles.append(axis.group);
    },
    dispose() {
      for (const axis of axes)
        axis.group.removeEventListener("pointerdown", axis.pick);
      svg.remove();
    },
  };
};
