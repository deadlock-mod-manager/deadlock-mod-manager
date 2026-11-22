import { type Icon } from "@phosphor-icons/react";

export interface ViewerLook {
  bloom: boolean;
  outlines: boolean;
  antialias: boolean;
  wireframe: boolean;
  exposure: number;
  lighting: "studio" | "neutral" | "dramatic";
  lightIntensity: number;
  bloomStrength: number;
}

export const DEFAULT_LOOK: ViewerLook = {
  bloom: false,
  outlines: false,
  antialias: true,
  wireframe: false,
  exposure: 0.95,
  lighting: "studio",
  lightIntensity: 1,
  bloomStrength: 0.3,
};

export interface ViewerOverlayToggle {
  id: string;
  label: string;
  icon: Icon;
  shortcut?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export const overlaySurface =
  "border border-white/10 bg-background/90 shadow-black/40 shadow-lg";

export const EASE_OUT_QUART = "cubic-bezier(0.25, 1, 0.5, 1)";
