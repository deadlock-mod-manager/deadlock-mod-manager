/** The UV editor displays RGB; packed/unused texture alpha is preserved for export. */
export function opaquePaintPreview(pixels: Uint8Array) {
  const display = new Uint8ClampedArray(pixels);
  for (let i = 3; i < display.length; i += 4) display[i] = 255;
  return display;
}
