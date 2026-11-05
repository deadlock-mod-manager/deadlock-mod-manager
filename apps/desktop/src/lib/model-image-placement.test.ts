import { describe, expect, test } from "bun:test";
import {
  cropModelImageFrames,
  defaultImageAlignment,
  dragImagePlacement,
  imagePlacementGeometry,
  createImagePlacementUpdates,
} from "./model-image-placement";

const viewport = { width: 800, height: 400 };
const image = { width: 400, height: 200 };

describe("viewport image placement", () => {
  test("high-rate pointer input publishes once per display frame and release keeps the last position", () => {
    const callbacks: FrameRequestCallback[] = [];
    const published: number[] = [];
    const cancelled: number[] = [];
    const updates = createImagePlacementUpdates(
      (value) => published.push(value.center[0]),
      (callback) => {
        callbacks.push(callback);
        return callbacks.length;
      },
      (id) => cancelled.push(id),
    );
    for (let i = 0; i < 1000; i++)
      updates.queue({ ...defaultImageAlignment(), center: [i / 1000, 0.5] });
    expect(callbacks).toHaveLength(1);
    expect(published).toHaveLength(0);
    callbacks[0](16);
    expect(published).toEqual([0.999]);
    updates.queue({ ...defaultImageAlignment(), center: [0.5, 0.5] });
    updates.flush();
    expect(published).toEqual([0.999, 0.5]);
    updates.queue(defaultImageAlignment());
    updates.cancel();
    callbacks[2](32);
    expect(published).toHaveLength(2);
    expect(cancelled).toEqual([1, 2, 3]);
  });
  test("moving is normalized to the actual viewport and clamps at its edges", () => {
    const start = defaultImageAlignment();
    const moved = dragImagePlacement(
      start,
      "move",
      { x: 80, y: -40 },
      viewport,
      image,
      false,
    );
    expect(moved.center).toEqual([0.6, 0.4]);
    expect(start.center).toEqual([0.5, 0.5]);
    expect(
      dragImagePlacement(
        start,
        "move",
        { x: -900, y: 900 },
        viewport,
        image,
        false,
      ).center,
    ).toEqual([0, 1]);
  });
  test("resizing a rotated image keeps its opposite corner anchored", () => {
    const start = {
      ...defaultImageAlignment(),
      scale: 0.5,
      rotation: Math.PI / 2,
    };
    const resized = dragImagePlacement(
      start,
      "se",
      { x: -100, y: 200 },
      viewport,
      image,
      false,
    );
    expect(resized.scale).toBeCloseTo(0.75);
    expect(resized.center[0]).toBeCloseTo(0.4375);
    expect(resized.center[1]).toBeCloseTo(0.75);
    expect(
      imagePlacementGeometry(image, resized, viewport).size.width,
    ).toBeCloseTo(600);
  });
  test("cropping uses image-local axes after rotation and cannot invert the crop", () => {
    const start = {
      ...defaultImageAlignment(),
      scale: 0.5,
      rotation: Math.PI / 2,
    };
    const cropped = dragImagePlacement(
      start,
      "nw",
      { x: -50, y: 100 },
      viewport,
      image,
      true,
    );
    expect(cropped.crop.left).toBeCloseTo(0.25);
    expect(cropped.crop.top).toBeCloseTo(0.25);
    expect(cropped.scale).toBe(0.5);
    const bounded = dragImagePlacement(
      start,
      "nw",
      { x: -1000, y: 1000 },
      viewport,
      image,
      true,
    );
    expect(bounded.crop.left).toBeCloseTo(1 - 1 / image.width);
    expect(bounded.crop.top).toBeCloseTo(1 - 1 / image.height);
  });
  test("cropped bake matches the displayed position and rotation instead of stretching to the old bounds", () => {
    const placement = {
      ...defaultImageAlignment(),
      scale: 0.5,
      rotation: Math.PI / 2,
      crop: { left: 0.25, top: 0, right: 1, bottom: 0.5 },
    };
    const result = imagePlacementGeometry(image, placement, viewport);
    expect(result.size).toEqual({ width: 300, height: 100 });
    expect(result.center.x).toBeCloseTo(450);
    expect(result.center.y).toBeCloseTo(250);
  });
  test("every animated frame uses identical crop pixels while preserving alpha and timing", () => {
    const frames = [40, 170].map((durationMs) => ({
      width: 3,
      height: 2,
      durationMs,
      rgba: new Uint8Array([
        1, 2, 3, 0, 4, 5, 6, 128, 7, 8, 9, 255, 10, 11, 12, 255, 13, 14, 15,
        128, 16, 17, 18, 0,
      ]),
    }));
    const cropped = cropModelImageFrames(frames, {
      left: 1 / 3,
      top: 0.5,
      right: 1,
      bottom: 1,
    });
    expect(cropped.map((frame) => frame.durationMs)).toEqual([40, 170]);
    expect(cropped[0].width).toBe(2);
    expect(cropped[0].height).toBe(1);
    expect([...cropped[0].rgba]).toEqual([13, 14, 15, 128, 16, 17, 18, 0]);
    expect(frames[0].rgba).toHaveLength(24);
    expect(cropModelImageFrames(frames)[0]).toBe(frames[0]);
  });
});
