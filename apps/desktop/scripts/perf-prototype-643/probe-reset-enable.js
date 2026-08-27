const attempt = async (name, operation) => {
  const startedAt = performance.now();
  try {
    const value = await operation();
    return { name, elapsedMs: performance.now() - startedAt, value };
  } catch (error) {
    return {
      name,
      elapsedMs: performance.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      errorJson: JSON.stringify(error),
      errorKeys:
        typeof error === "object" && error !== null ? Object.keys(error) : [],
    };
  }
};

(() => {
  const resultKey = "__DMM_ISSUE_643_RESULT__";
  const invoke = window["__TAURI_INTERNALS__"].invoke;
  globalThis[resultKey] = undefined;

  void (async () => {
    const stages = [];
    stages.push(
      await attempt("set-game-path", () =>
        invoke("set_game_path", { path: "__GAME_PATH__" }),
      ),
    );
    stages.push(
      await attempt("initial-enable", () =>
        invoke("switch_profile", { profileFolder: null }),
      ),
    );
    stages.push(
      await attempt("status-after-initial-enable", () =>
        invoke("get_gameinfo_status"),
      ),
    );
    stages.push(
      await attempt("reset-to-vanilla", () => invoke("reset_to_vanilla")),
    );
    stages.push(
      await attempt("status-after-reset", () => invoke("get_gameinfo_status")),
    );
    stages.push(
      await attempt("retry-enable", () =>
        invoke("switch_profile", { profileFolder: null }),
      ),
    );
    stages.push(
      await attempt("final-status", () => invoke("get_gameinfo_status")),
    );

    globalThis[resultKey] = {
      stages,
      hasFocus: document.hasFocus(),
      visibilityState: document.visibilityState,
    };
  })();

  return "started";
})();
