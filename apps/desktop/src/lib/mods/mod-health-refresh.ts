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
