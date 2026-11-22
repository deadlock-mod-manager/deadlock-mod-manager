import { ModStatus } from "@/types/mods";
import {
  createContext,
  type FC,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import useAbout from "@/hooks/use-about";
import { useAnalyticsEvents } from "@/hooks/use-analytics-events";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";

interface AnalyticsContextType {
  // The analytics events hook is re-exported for convenience
  analytics: ReturnType<typeof useAnalyticsEvents>;
}

const AnalyticsContext = createContext<AnalyticsContextType | null>(null);

interface AnalyticsProviderProps {
  children: ReactNode;
}

export const AnalyticsProvider: FC<AnalyticsProviderProps> = ({ children }) => {
  const analytics = useAnalyticsEvents();
  const { version } = useAbout();
  const hasTrackedAppStart = useRef<boolean>(false);

  const telemetrySettings = usePersistedStore(
    (state) => state.telemetrySettings,
  );
  const modsState = usePersistedStore((state) => state.localMods);
  const profilesState = usePersistedStore((state) => state.profiles);

  // Track app started event
  useEffect(() => {
    if (
      analytics.isEnabled &&
      !hasTrackedAppStart.current &&
      telemetrySettings.analyticsEnabled &&
      modsState &&
      profilesState
    ) {
      analytics.trackAppStarted({
        total_mods_at_startup: modsState.length,
        installed_mod_count: modsState.filter(
          (mod) => mod.status === ModStatus.Installed,
        ).length,
        total_profiles_at_startup: Object.keys(profilesState).length,
      });

      hasTrackedAppStart.current = true;
      logger.info("App started event tracked");
    }
  }, [
    analytics,
    telemetrySettings.analyticsEnabled,
    version,
    modsState,
    profilesState,
  ]);

  const contextValue = useMemo<AnalyticsContextType>(
    () => ({ analytics }),
    [analytics],
  );

  return (
    <AnalyticsContext.Provider value={contextValue}>
      {children}
    </AnalyticsContext.Provider>
  );
};

export const useAnalyticsContext = (): AnalyticsContextType => {
  const context = useContext(AnalyticsContext);
  if (!context) {
    throw new Error(
      "useAnalyticsContext must be used within an AnalyticsProvider",
    );
  }
  return context;
};
