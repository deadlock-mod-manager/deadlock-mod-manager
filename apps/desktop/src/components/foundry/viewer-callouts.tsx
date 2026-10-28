import { CheckIcon } from "@phosphor-icons/react";
import { type RefObject, useEffect, useState } from "react";
import * as THREE from "three";
import { colorTextureOf } from "./viewer-color-texture";

export interface ViewerCallout {
  texture: string;
  label: string;
}

interface PlacedCallout extends ViewerCallout {
  anchorX: number;
  anchorY: number;
  /** Which side of the hero the tag sits on. */
  side: "left" | "right";
}

/** Re-placed this often while the model animates or the camera moves. */
const PLACE_INTERVAL_MS = 100;
/** How far the tag sits from its anchor, in pixels. */
const LEADER_PX = 110;
const TAG_HEIGHT_PX = 24;

/** Where each section's middle lands on screen, and which side its tag goes. */
const place = (
  callouts: readonly ViewerCallout[],
  root: THREE.Object3D,
  camera: THREE.Camera,
  width: number,
  height: number,
): PlacedCallout[] => {
  const boxes = new Map<string, THREE.Box3>();
  const wanted = new Set(callouts.map((callout) => callout.texture));
  root.updateMatrixWorld(true);
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || Array.isArray(child.material)) return;
    if (child.parent instanceof THREE.Mesh || !child.material.visible) return;
    const texture = colorTextureOf(child.material);
    if (texture === null || !wanted.has(texture)) return;
    const box = boxes.get(texture) ?? new THREE.Box3();
    box.expandByObject(child);
    boxes.set(texture, box);
  });
  const modelCentre = new THREE.Box3()
    .setFromObject(root)
    .getCenter(new THREE.Vector3())
    .project(camera);

  return callouts.flatMap((callout) => {
    const box = boxes.get(callout.texture);
    if (!box || box.isEmpty()) return [];
    const point = box.getCenter(new THREE.Vector3()).project(camera);
    if (point.z > 1) return [];
    return [
      {
        ...callout,
        anchorX: ((point.x + 1) / 2) * width,
        anchorY: ((1 - point.y) / 2) * height,
        side: point.x < modelCentre.x ? "left" : "right",
      },
    ];
  });
};

/**
 * Tags pinned to the selected sections, each joined to its spot on the model
 * by a leader line, so the hero itself shows what is about to be painted.
 */
export const ViewerCallouts = ({
  callouts,
  modelRef,
  getCamera,
  containerRef,
}: {
  callouts: readonly ViewerCallout[];
  modelRef: RefObject<THREE.Object3D | null>;
  /** Stable across renders; the camera can be replaced with the scene. */
  getCamera: () => THREE.Camera | null;
  containerRef: RefObject<HTMLElement | null>;
}) => {
  const [placed, setPlaced] = useState<PlacedCallout[]>([]);

  useEffect(() => {
    if (callouts.length === 0) {
      setPlaced([]);
      return;
    }
    const update = () => {
      const root = modelRef.current;
      const camera = getCamera();
      const container = containerRef.current;
      if (!root || !camera || !container) return;
      setPlaced(
        place(
          callouts,
          root,
          camera,
          container.clientWidth,
          container.clientHeight,
        ),
      );
    };
    update();
    const timer = window.setInterval(update, PLACE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [callouts, modelRef, getCamera, containerRef]);

  return (
    <div aria-hidden className='pointer-events-none absolute inset-0'>
      {placed.map((callout) => {
        const left = callout.side === "left";
        const lineStart = left ? callout.anchorX - LEADER_PX : callout.anchorX;
        return (
          <div key={callout.texture}>
            <span
              className='absolute h-px bg-primary/50'
              style={{
                left: lineStart,
                top: callout.anchorY,
                width: LEADER_PX,
              }}
            />
            <span
              className='absolute h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary'
              style={{ left: callout.anchorX, top: callout.anchorY }}
            />
            <span
              className='absolute flex items-center gap-1 whitespace-nowrap rounded-[5px] bg-primary px-2 font-semibold text-[11px] text-primary-foreground'
              style={{
                height: TAG_HEIGHT_PX,
                top: callout.anchorY - TAG_HEIGHT_PX / 2,
                ...(left
                  ? { right: `calc(100% - ${lineStart}px)` }
                  : { left: callout.anchorX + LEADER_PX }),
              }}>
              <CheckIcon className='h-[11px] w-[11px]' weight='bold' />
              {callout.label}
            </span>
          </div>
        );
      })}
    </div>
  );
};
