import { invoke } from "@tauri-apps/api/core";
import { createContext, useContext, useEffect, useMemo } from "react";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";

type AppProviderProps = {
  children: React.ReactNode;
};

type AppProviderState = {
  _placeholder?: unknown; // Just a placeholder
};

const AppProviderContext = createContext<AppProviderState>({});

export const AppProvider = ({ children, ...props }: AppProviderProps) => {
  const gamePath = usePersistedStore((s) => s.gamePath);
  const setGamePath = usePersistedStore((s) => s.setGamePath);
  const clearLastJoin = usePersistedStore((s) => s.clearLastJoin);

  useEffect(() => {
    const cleanupStaleServerGameinfo = async () => {
      // Wait for hydration: getActiveProfile would otherwise return null
      // and silently downgrade gameinfo.gi to the root addons folder.
      const persist = usePersistedStore.persist;
      if (!persist.hasHydrated()) {
        await new Promise<void>((resolve) => {
          const unsubscribe = persist.onFinishHydration(() => {
            unsubscribe();
            resolve();
          });
        });
      }

      const activeProfile = usePersistedStore.getState().getActiveProfile();
      const reverted = await invoke<boolean>("cleanup_stale_server_gameinfo", {
        activeProfileFolder: activeProfile?.folderName ?? null,
      });
      if (reverted) {
        clearLastJoin();
        logger.info("Reverted stale server gameinfo on app bootstrap");
      }
    };

    const resolveGamePath = async () => {
      if (gamePath) {
        try {
          await invoke<string>("set_game_path", { path: gamePath });
          return;
        } catch {
          setGamePath("");
        }
      }
      const found = await invoke<string>("find_game_path");
      setGamePath(found);
    };

    resolveGamePath()
      .then(cleanupStaleServerGameinfo)
      .catch((error) => {
        logger.withError(error).debug("App bootstrap initialization skipped");
      });
  }, []);

  const contextValue = useMemo<AppProviderState>(() => ({}), []);

  return (
    <AppProviderContext.Provider {...props} value={contextValue}>
      {children}
    </AppProviderContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppProviderContext);
  if (context === undefined) {
    throw new Error("useApp must be used within a AppProvider");
  }
  return context;
};
