import type { Camera, Vector3, Quaternion } from "three";
import {
  createViewerAxisProjection,
  pickViewerAxis,
} from "./viewer-axis-projection";

const SIZE = 84;
const EXTENT = 3.2;

/** A bitmap overlay avoids SVG layout invalidation while the camera moves. */
export const createViewerAxisGizmo = (
  container: HTMLDivElement,
  camera: Camera,
  onDirection: (direction: Vector3) => void,
  modelOrientation?: () => Quaternion,
) => {
  const canvas = document.createElement("canvas");
  canvas.style.width = canvas.style.height = "100%";
  canvas.style.display = "block";
  canvas.setAttribute("aria-hidden", "true");
  container.append(canvas);
  const context = canvas.getContext("2d");
  const projection = createViewerAxisProjection();
  let ratio = 0;
  const pick = (event: PointerEvent) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const rect = canvas.getBoundingClientRect();
    const direction = pickViewerAxis(
      projection.axes,
      ((event.clientX - rect.left) / rect.width - 0.5) * EXTENT,
      (0.5 - (event.clientY - rect.top) / rect.height) * EXTENT,
    );
    if (direction) onDirection(direction);
  };
  canvas.addEventListener("pointerdown", pick);
  return {
    update() {
      if (!context) return;
      const nextRatio = Math.min(window.devicePixelRatio, 2);
      const resized = nextRatio !== ratio;
      if (
        !projection.update(camera.quaternion, modelOrientation?.()) &&
        !resized
      )
        return;
      if (resized) {
        ratio = nextRatio;
        canvas.width = canvas.height = Math.round(SIZE * ratio);
      }
      const scale = (SIZE * ratio) / EXTENT;
      context.setTransform(
        scale,
        0,
        0,
        scale,
        canvas.width / 2,
        canvas.height / 2,
      );
      context.clearRect(-EXTENT / 2, -EXTENT / 2, EXTENT, EXTENT);
      for (const axis of projection.axes) {
        if (!axis.label) continue;
        context.globalAlpha = 0.8;
        context.strokeStyle = axis.color;
        context.lineWidth = 0.04;
        context.beginPath();
        context.moveTo(0, 0);
        context.lineTo(axis.projected.x * 0.8, -axis.projected.y * 0.8);
        context.stroke();
      }
      for (const axis of projection.axes) {
        const x = axis.projected.x,
          y = -axis.projected.y;
        context.globalAlpha = axis.label ? 1 : 0.55;
        context.strokeStyle = context.fillStyle = axis.color;
        context.lineWidth = 0.06;
        context.beginPath();
        context.arc(x, y, axis.label ? 0.26 : 0.17, 0, Math.PI * 2);
        if (axis.label) context.fill();
        context.stroke();
        if (axis.label) {
          context.font = "bold 0.4px sans-serif";
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.fillStyle = "#1a1712";
          context.fillText(axis.label, x, y);
        }
      }
      context.globalAlpha = 1;
    },
    dispose() {
      canvas.removeEventListener("pointerdown", pick);
      canvas.remove();
    },
  };
};
