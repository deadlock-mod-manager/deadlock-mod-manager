let activePauses = 0;
let startedPauses = 0;

/**
 * Pauses the auto-reset while a flow stops the game and relaunches it on
 * purpose, such as a server join. Without it, the closed window in between
 * would look like a normal exit and wipe the gameinfo.gi the flow just staged.
 * Call the returned function once the flow is done.
 */
export const pauseGameinfoAutoReset = (): (() => void) => {
  activePauses++;
  startedPauses++;
  return () => {
    activePauses--;
  };
};

export const isGameinfoAutoResetPaused = (): boolean => activePauses > 0;

/**
 * Grows with every pause. Watchers compare it between polls, because a flow can
 * finish before the game is back up (e.g. a Steam URL or a manual connect code).
 */
export const gameinfoAutoResetPauseCount = (): number => startedPauses;

/** Only a running → stopped change we actually saw counts as an exit. */
export const didGameExit = (
  previous: boolean | undefined,
  current: boolean | undefined,
): boolean => previous === true && current === false;
