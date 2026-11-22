const REFRESH_DELAY_MS = 1500;

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
