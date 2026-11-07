// Enable all and collection installs land one mod at a time.
const REFRESH_DELAY_MS = 1500;

/**
 * Coalesces backend compatibility events and installed-file changes per
 * profile. Each batch rebuilds the fixed mods' repair package and checks the
 * profile's mod health. The check skips mods whose files are unchanged, so it
 * only analyses what changed, including an update that kept its VPK names.
 */
export const createModHealthRefreshQueue = ({
  refreshFixes,
  checkHealth,
}: {
  refreshFixes: (profileFolder: string | null) => void;
  checkHealth: (profileFolder: string | null) => void;
}) => {
  const pending = new Map<string | null, ReturnType<typeof setTimeout>>();

  return {
    schedule(profileFolder: string | null) {
      clearTimeout(pending.get(profileFolder));
      pending.set(
        profileFolder,
        setTimeout(() => {
          pending.delete(profileFolder);
          refreshFixes(profileFolder);
          checkHealth(profileFolder);
        }, REFRESH_DELAY_MS),
      );
    },
    cancelAll() {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    },
  };
};
