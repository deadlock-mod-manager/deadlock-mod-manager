import { describe, expect, it } from "bun:test";
import { audioWaveform } from "./audio-waveform";

describe("audioWaveform", () => {
  it("includes peaks from every channel and preserves silence", () => {
    expect(
      audioWaveform(
        [
          new Float32Array([0, 0, 0.2, -0.4]),
          new Float32Array([0, 0, -0.9, 0]),
        ],
        2,
      ),
    ).toEqual([0, expect.closeTo(0.9)]);
  });
  it("handles empty and shorter-than-display clips", () => {
    expect(audioWaveform([])).toEqual([]);
    expect(audioWaveform([new Float32Array([0.5])])).toEqual([0.5]);
  });
});
