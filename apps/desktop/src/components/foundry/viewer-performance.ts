import type * as THREE from "three";
import { createGpuFrameTimer } from "@/lib/particles/gpu-frame-timer";

const CAPACITY = 240;
const median = (values: number[]) => {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.floor(ordered.length / 2)] ?? null;
};

/** Bounded development measurements, readable through the desktop MCP bridge. */
export function createViewerPerformance(renderer: THREE.WebGLRenderer) {
  const context = renderer.getContext();
  const gpu = "createQuery" in context ? createGpuFrameTimer(context) : null;
  const samples: {
    simulation: number;
    preparation: number;
    submission: number;
    pacing: number;
  }[] = [];
  const gpuSamples: number[] = [];
  let frame = 0;
  const previousAutoReset = renderer.info.autoReset;
  renderer.info.autoReset = false;
  return {
    begin() {
      renderer.info.reset();
      gpu?.begin(frame);
    },
    end(
      simulation: number,
      preparation: number,
      submission: number,
      pacing: number,
    ) {
      gpu?.end();
      const measured = gpu?.poll();
      if (measured) {
        gpuSamples.push(measured.milliseconds);
        if (gpuSamples.length > CAPACITY) gpuSamples.shift();
      }
      samples.push({ simulation, preparation, submission, pacing });
      if (samples.length > CAPACITY) samples.shift();
      frame += 1;
      if (frame % 60 !== 0) return;
      renderer.domElement.dataset.viewerPerformance = JSON.stringify({
        samples: samples.length,
        cpuSimulationMs: median(samples.map((sample) => sample.simulation)),
        cpuPreparationMs: median(samples.map((sample) => sample.preparation)),
        cpuSubmissionMs: median(samples.map((sample) => sample.submission)),
        framePacingMs: median(samples.map((sample) => sample.pacing)),
        gpuMs: median(gpuSamples),
        gpuSamples: gpuSamples.length,
        gpuTimerSupported: gpu !== null,
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        textures: renderer.info.memory.textures,
        geometries: renderer.info.memory.geometries,
      });
    },
    dispose() {
      gpu?.dispose();
      renderer.info.autoReset = previousAutoReset;
      delete renderer.domElement.dataset.viewerPerformance;
    },
  };
}
