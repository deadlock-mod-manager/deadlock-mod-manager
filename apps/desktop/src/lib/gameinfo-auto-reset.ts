let activePauses = 0;
let startedPauses = 0;

export const pauseGameinfoAutoReset = (): (() => void) => {
  activePauses++;
  startedPauses++;
  return () => {
    activePauses--;
  };
};

export const isGameinfoAutoResetPaused = (): boolean => activePauses > 0;

export const gameinfoAutoResetPauseCount = (): number => startedPauses;

export const didGameExit = (
  previous: boolean | undefined,
  current: boolean | undefined,
): boolean => previous === true && current === false;
