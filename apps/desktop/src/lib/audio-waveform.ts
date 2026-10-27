export function audioWaveform(
  channels: readonly Float32Array[],
  bins = 256,
): number[] {
  const length = channels[0]?.length ?? 0;
  if (length === 0 || bins < 1) return [];
  return Array.from({ length: Math.min(bins, length) }, (_, bin) => {
    const start = Math.floor((bin * length) / Math.min(bins, length));
    const end = Math.floor(((bin + 1) * length) / Math.min(bins, length));
    let peak = 0;
    for (const channel of channels) {
      for (let sample = start; sample < end; sample++) {
        peak = Math.max(peak, Math.abs(channel[sample] ?? 0));
      }
    }
    return Math.min(1, peak);
  });
}
