import { type Icon } from "@phosphor-icons/react";

export interface ViewerLook {
  bloom: boolean;
  outlines: boolean;
  antialias: boolean;
  wireframe: boolean;
  exposure: number;
}

export const DEFAULT_LOOK: ViewerLook = {
  bloom: false,
  outlines: false,
  antialias: true,
  wireframe: false,
  exposure: 0.95,
};

/** A View menu switch for something drawn over the model, such as the ability bar. */
export interface ViewerOverlayToggle {
  id: string;
  label: string;
  icon: Icon;
  shortcut?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/** Controls float over the render, so they need their own backdrop to stay legible on any background image. */
export const overlaySurface =
  "border border-white/10 bg-background/80 shadow-black/40 shadow-lg backdrop-blur-sm";

export const EASE_OUT_QUART = "cubic-bezier(0.25, 1, 0.5, 1)";
