import * as THREE from "three";
import { RuntimeError } from "@deadlock-mods/common/client-errors";
export const RECORDING_LIMIT_MS = 10_000;

/** One bounded recording at a time; releasing the viewer also releases its stream. */
export const createViewerRecorder = (canvas: HTMLCanvasElement) => {
  let recorder: MediaRecorder | null = null;
  let cancel: (() => void) | null = null;
  let disposed = false;
  return {
    get recording() {
      return recorder?.state === "recording";
    },
    record(): Promise<Blob> {
      if (disposed || recorder)
        return Promise.reject(
          new RuntimeError("Viewer recording is unavailable"),
        );
      const mimeType = [
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType)
        return Promise.reject(
          new RuntimeError("WebM recording is unsupported"),
        );
      const stream = canvas.captureStream(30);
      return new Promise((resolve, reject) => {
        let active: MediaRecorder;
        try {
          active = new MediaRecorder(stream, {
            mimeType,
            videoBitsPerSecond: 6_000_000,
          });
        } catch (error) {
          stream.getTracks().forEach((track) => track.stop());
          reject(error);
          return;
        }
        recorder = active;
        const chunks: Blob[] = [];
        const events = new AbortController();
        const timer = window.setTimeout(() => {
          if (active.state !== "inactive") active.stop();
        }, RECORDING_LIMIT_MS);
        const release = () => {
          window.clearTimeout(timer);
          stream.getTracks().forEach((track) => track.stop());
          recorder = null;
          cancel = null;
          events.abort();
        };
        cancel = () => {
          if (active.state !== "inactive") active.stop();
          release();
          reject(new DOMException("Viewer closed", "AbortError"));
        };
        active.addEventListener(
          "dataavailable",
          (event) => {
            if (event.data.size) chunks.push(event.data);
          },
          { signal: events.signal },
        );
        active.addEventListener(
          "error",
          () => {
            release();
            reject(new RuntimeError("Viewer recording failed"));
          },
          { signal: events.signal, once: true },
        );
        active.addEventListener(
          "stop",
          () => {
            release();
            resolve(new Blob(chunks, { type: mimeType }));
          },
          { signal: events.signal, once: true },
        );
        try {
          active.start(250);
        } catch (error) {
          release();
          reject(error);
        }
      });
    },
    stop() {
      if (recorder?.state === "recording") recorder.stop();
    },
    dispose() {
      disposed = true;
      cancel?.();
    },
  };
};

/** Room left around the hero in a still, as a share of its height. */
const STILL_PADDING = 0.06;

/**
 * Render one frame and crop it to the hero's posed outline, for places that
 * show the finished skin without a live viewer.
 */
export const captureHeroStill = async (
  root: THREE.Object3D,
  camera: THREE.Camera,
  renderer: THREE.WebGLRenderer,
  render: () => Promise<Blob | null> | undefined,
): Promise<Blob | null> => {
  const frame = await render();
  if (!frame) return null;
  const box = new THREE.Box3().setFromObject(root, true);
  const canvas = renderer.domElement;
  let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        const point = new THREE.Vector3(x, y, z).project(camera);
        const px = ((point.x + 1) / 2) * canvas.width;
        const py = ((1 - point.y) / 2) * canvas.height;
        left = Math.min(left, px);
        right = Math.max(right, px);
        top = Math.min(top, py);
        bottom = Math.max(bottom, py);
      }
    }
  }
  const pad = (bottom - top) * STILL_PADDING;
  left = Math.max(0, Math.floor(left - pad));
  top = Math.max(0, Math.floor(top - pad));
  right = Math.min(canvas.width, Math.ceil(right + pad));
  bottom = Math.min(canvas.height, Math.ceil(bottom + pad));
  if (right <= left || bottom <= top) return frame;

  const image = await createImageBitmap(frame);
  const crop = document.createElement("canvas");
  crop.width = right - left;
  crop.height = bottom - top;
  crop
    .getContext("2d")
    ?.drawImage(
      image,
      left,
      top,
      crop.width,
      crop.height,
      0,
      0,
      crop.width,
      crop.height,
    );
  image.close();
  return new Promise((resolve) => crop.toBlob(resolve, "image/png"));
};
