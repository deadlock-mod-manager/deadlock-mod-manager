import { calculateGap } from "./calculator";
import { CANVAS_CONSTANTS } from "./constants";
import type { CrosshairConfig } from "./types";

export const drawCenterDot = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: { r: number; g: number; b: number },
  opacity: number,
) => {
  ctx.fillStyle = `rgb(${color.r} ${color.g} ${color.b} / ${opacity})`;
  ctx.fillRect(
    x - CANVAS_CONSTANTS.DOT_OFFSET_X,
    y - CANVAS_CONSTANTS.DOT_OFFSET_Y,
    CANVAS_CONSTANTS.DOT_WIDTH,
    CANVAS_CONSTANTS.DOT_HEIGHT,
  );
};

export const drawCenterCircle = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  outlineOpacity: number,
) => {
  const circle = new Path2D();
  circle.ellipse(
    x,
    y,
    CANVAS_CONSTANTS.CIRCLE_RADIUS,
    CANVAS_CONSTANTS.CIRCLE_RADIUS + CANVAS_CONSTANTS.CIRCLE_HEIGHT_OFFSET,
    2 * Math.PI,
    0,
    2 * Math.PI,
  );

  ctx.fillStyle = "rgba(0,0,0,0)";
  ctx.fill(circle);
  ctx.lineWidth = CANVAS_CONSTANTS.CIRCLE_STROKE_WIDTH;
  ctx.strokeStyle = `rgb(0 0 0 / ${outlineOpacity})`;
  ctx.stroke(circle);
};

export const drawLine = (
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  width: number,
  color: { r: number; g: number; b: number },
  opacity: number,
) => {
  ctx.strokeStyle = `rgb(${color.r} ${color.g} ${color.b} / ${opacity})`;
  ctx.lineWidth = width;
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();
};

export const drawLineWithBorder = (
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  width: number,
  color: { r: number; g: number; b: number },
  opacity: number,
) => {
  ctx.strokeStyle = `rgba(0,0,0,${opacity})`;
  ctx.lineWidth = width;
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  const innerLineWidth = width - 1;
  const shortenAmount = CANVAS_CONSTANTS.BORDER_WIDTH;
  const shortenedStartX = startX + (startX === endX ? 0 : shortenAmount);
  const shortenedStartY = startY + (startY === endY ? 0 : shortenAmount);
  const shortenedEndX = endX - (startX === endX ? 0 : shortenAmount);
  const shortenedEndY = endY - (startY === endY ? 0 : shortenAmount);

  ctx.strokeStyle = `rgb(${color.r} ${color.g} ${color.b} / ${opacity})`;
  ctx.lineWidth = innerLineWidth;
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(shortenedStartX, shortenedStartY);
  ctx.lineTo(shortenedEndX, shortenedEndY);
  ctx.stroke();
};

export const renderCrosshair = (
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  config: CrosshairConfig,
  mouseX?: number,
  mouseY?: number,
  backgroundImage?: HTMLImageElement,
) => {
  const x = mouseX ?? canvas.width / 2;
  const y = mouseY ?? canvas.height / 2;

  const gapValue = calculateGap(config);
  const {
    width,
    height,
    color,
    pipOpacity,
    dotOpacity,
    dotOutlineOpacity,
    pipBorder,
  } = config;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (backgroundImage) {
    ctx.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height);
  }

  ctx.beginPath();

  drawCenterDot(ctx, x, y, color, dotOpacity);
  drawCenterCircle(ctx, x, y, dotOutlineOpacity);

  const halfLength = height / 2;
  const bCrosshairStart = y + gapValue;
  const lCrosshairStart = x - gapValue;
  const rCrosshairStart = x + gapValue;
  const tCrosshairStart = y - gapValue;

  const drawFn = pipBorder ? drawLineWithBorder : drawLine;

  drawFn(
    ctx,
    x,
    bCrosshairStart - halfLength,
    x,
    bCrosshairStart + halfLength,
    width,
    color,
    pipOpacity,
  );

  drawFn(
    ctx,
    rCrosshairStart - halfLength,
    y,
    rCrosshairStart + halfLength,
    y,
    width,
    color,
    pipOpacity,
  );

  drawFn(
    ctx,
    lCrosshairStart - halfLength,
    y,
    lCrosshairStart + halfLength,
    y,
    width,
    color,
    pipOpacity,
  );

  drawFn(
    ctx,
    x,
    tCrosshairStart - halfLength,
    x,
    tCrosshairStart + halfLength,
    width,
    color,
    pipOpacity,
  );
};
