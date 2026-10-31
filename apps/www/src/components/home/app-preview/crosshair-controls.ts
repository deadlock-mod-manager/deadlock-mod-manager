export const SWATCHES = [
  { id: "white", color: { r: 255, g: 255, b: 255 } },
  { id: "gold", color: { r: 239, g: 224, b: 190 } },
  { id: "green", color: { r: 74, g: 222, b: 128 } },
  { id: "cyan", color: { r: 34, g: 211, b: 238 } },
  { id: "pink", color: { r: 255, g: 140, b: 192 } },
] as const;

export const SLIDERS: {
  key: "gap" | "width" | "height" | "dotOpacity";
  min: number;
  max: number;
  step: number;
}[] = [
  { key: "gap", min: -10, max: 20, step: 1 },
  { key: "width", min: 1, max: 12, step: 1 },
  { key: "height", min: 2, max: 40, step: 1 },
  { key: "dotOpacity", min: 0, max: 1, step: 0.05 },
];
