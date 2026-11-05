/** Give input and the current frame priority over background thumbnail parsing. */
export const waitForPreviewIdle = (signal: AbortSignal): Promise<void> => {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const done = () => {
      signal.removeEventListener("abort", cancel);
      resolve();
    };
    let cancelSchedule: () => void;
    if (typeof requestIdleCallback === "function") {
      const handle = requestIdleCallback(done, { timeout: 250 });
      cancelSchedule = () => cancelIdleCallback(handle);
    } else {
      const handle = setTimeout(done, 32);
      cancelSchedule = () => clearTimeout(handle);
    }
    const cancel = () => {
      cancelSchedule();
      signal.removeEventListener("abort", cancel);
      reject(signal.reason);
    };
    signal.addEventListener("abort", cancel, { once: true });
  });
};
