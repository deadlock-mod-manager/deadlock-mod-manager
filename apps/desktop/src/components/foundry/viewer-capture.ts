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
