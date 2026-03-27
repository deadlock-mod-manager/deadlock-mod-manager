export function getEyeDropperConstructor(): EyeDropperConstructor | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  return window.EyeDropper;
}
