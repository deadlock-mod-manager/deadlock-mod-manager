(() => {
  const resultKey = "__DMM_ISSUE_642_RESULT__";
  const invoke = window["__TAURI_INTERNALS__"].invoke;
  globalThis[resultKey] = undefined;

  void (async () => {
    const gaps = [];
    let previous = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      gaps.push(now - previous);
      previous = now;
    }, 10);

    const startedAt = performance.now();
    try {
      let values = await invoke("read_dropped_mod_file", {
        filePath: "__FIXTURE_PATH__",
      });
      const readCompletedAt = performance.now();
      let bytes = new Uint8Array(values);
      values = undefined;
      const conversionCompletedAt = performance.now();
      await invoke("plugin:fs|write_file", bytes, {
        headers: {
          path: encodeURIComponent("__TARGET_PATH__"),
          options: JSON.stringify({}),
        },
      });
      const writeCompletedAt = performance.now();
      await new Promise((resolve) => setTimeout(resolve, 100));
      clearInterval(timer);
      const sorted = gaps.toSorted((left, right) => left - right);
      globalThis[resultKey] = {
        byteLength: bytes.length,
        readMs: readCompletedAt - startedAt,
        conversionMs: conversionCompletedAt - readCompletedAt,
        writeMs: writeCompletedAt - conversionCompletedAt,
        elapsedMs: writeCompletedAt - startedAt,
        maxTimerGapMs: Math.max(0, ...gaps),
        p95TimerGapMs: sorted[Math.floor(sorted.length * 0.95)] ?? null,
        gapsOver50Ms: gaps.filter((gap) => gap > 50).length,
        gapsOver250Ms: gaps.filter((gap) => gap > 250).length,
        timerSamples: gaps.length,
        hasFocus: document.hasFocus(),
        visibilityState: document.visibilityState,
      };
      bytes = undefined;
    } catch (error) {
      clearInterval(timer);
      globalThis[resultKey] = {
        error:
          error instanceof Error
            ? (error.stack ?? error.message)
            : String(error),
        elapsedMs: performance.now() - startedAt,
        maxTimerGapMs: Math.max(0, ...gaps),
        timerSamples: gaps.length,
        hasFocus: document.hasFocus(),
        visibilityState: document.visibilityState,
      };
    }
  })();

  return "started";
})();
