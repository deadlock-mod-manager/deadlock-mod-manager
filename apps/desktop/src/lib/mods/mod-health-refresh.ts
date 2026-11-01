// Enable all and collection installs land one mod at a time.
const REFRESH_DELAY_MS = 1500;

/**
 * Coalesces backend compatibility events and installed-file changes per profile.
 * Newly installed mods stay in the batch even when a backend event resets it.
 */
export const createModHealthRefreshQueue = (
  refresh: (profileFolder: string | null, modIds: string[]) => void,
) => {
  const pending = new Map<
    string | null,
    { timer: ReturnType<typeof setTimeout>; modIds: Set<string> }
  >();

  return {
    schedule(profileFolder: string | null, modIds: string[] = []) {
      const previous = pending.get(profileFolder);
      clearTimeout(previous?.timer);
      const combined = new Set([...(previous?.modIds ?? []), ...modIds]);
      pending.set(profileFolder, {
        modIds: combined,
        timer: setTimeout(() => {
          pending.delete(profileFolder);
          refresh(profileFolder, [...combined]);
        }, REFRESH_DELAY_MS),
      });
    },
    cancelAll() {
      for (const { timer } of pending.values()) clearTimeout(timer);
      pending.clear();
    },
  };
};

type ProfileActivation = { gamePath: string; profileFolder: string | null };

/**
 * Decides when to refresh saved repairs because a profile became active: on
 * start, after a profile switch, or once a game path is set. Its receipt may
 * have gone stale while DMM was closed or the profile was inactive. Later
 * reports for the same activation return false, so they never re-trigger it.
 */
export const createActivationTracker = () => {
  let last: ProfileActivation | null = null;
  return (activation: ProfileActivation) => {
    if (
      last?.gamePath === activation.gamePath &&
      last.profileFolder === activation.profileFolder
    ) {
      return false;
    }
    last = activation;
    return true;
  };
};
