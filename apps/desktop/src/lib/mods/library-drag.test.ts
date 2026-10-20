import { describe, expect, it } from "bun:test";
import type { Modifier } from "@dnd-kit/core";
import { anchorLibraryDragPreview } from "./library-drag";

const rect = {
  left: 256,
  top: 657,
  right: 481,
  bottom: 983,
  width: 225,
  height: 326,
};
const args: Parameters<Modifier>[0] = {
  active: null,
  activatorEvent: null,
  activeNodeRect: rect,
  draggingNodeRect: rect,
  containerNodeRect: null,
  over: null,
  overlayNodeRect: rect,
  scrollableAncestors: [],
  scrollableAncestorRects: [],
  transform: { x: 0, y: 0, scaleX: 1, scaleY: 1 },
  windowRect: null,
};

describe("library drag preview", () => {
  it("stays beside the pointer regardless of where the card was grabbed", () => {
    const destination = { x: 1080, y: 283 };
    for (const offset of [
      { x: 5, y: 5 },
      { x: 181, y: 80 },
    ]) {
      const clientX = rect.left + offset.x;
      const clientY = rect.top + offset.y;
      const transform = anchorLibraryDragPreview({
        ...args,
        activatorEvent: Object.assign(new Event("pointerdown"), {
          clientX,
          clientY,
        }),
        transform: {
          x: destination.x - clientX,
          y: destination.y - clientY,
          scaleX: 1,
          scaleY: 1,
        },
      });
      expect(rect.left + transform.x).toBe(destination.x + 12);
      expect(rect.top + transform.y).toBe(destination.y + 12);
    }
  });

  it("leaves transforms unchanged without a pointer event or measured overlay", () => {
    expect(anchorLibraryDragPreview(args)).toBe(args.transform);
    expect(
      anchorLibraryDragPreview({
        ...args,
        activatorEvent: Object.assign(new Event("pointerdown"), {
          clientX: 300,
          clientY: 700,
        }),
        draggingNodeRect: null,
      }),
    ).toBe(args.transform);
  });
});
