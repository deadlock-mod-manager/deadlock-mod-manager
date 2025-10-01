import {
  createContext,
  type FC,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
} from "react";
import useAbout from "@/hooks/use-about";
import { useAnalyticsEvents } from "@/hooks/use-analytics-events";
import { useHardwareId } from "@/hooks/use-hardware-id";
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
  const { hardwareId } = useHardwareId();
  const { version } = useAbout();
  const isIdentified = useRef<boolean>(false);
  const hasTrackedAppStart = useRef<boolean>(false);

  const telemetrySettings = usePersistedStore(
    (state) => state.telemetrySettings,
  );
  const modsState = usePersistedStore((state) => state.localMods);
  const profilesState = usePersistedStore((state) => state.profiles);

  // Identify user when analytics is enabled and hardware ID is available
  useEffect(() => {
    if (
      analytics.isEnabled &&
      hardwareId &&
      !isIdentified.current &&
      telemetrySettings.analyticsEnabled &&
      modsState &&
      profilesState
    ) {
      const totalMods = Object.keys(modsState).length;
      const totalProfiles = Object.keys(profilesState).length;

      analytics.identifyUser(hardwareId, {
        app_version: version,
        platform: "desktop",
        total_mods_installed: totalMods,
        total_profiles_created: totalProfiles,
        first_identified_at: new Date().toISOString(),
      });

      isIdentified.current = true;
      logger.info("User identified for analytics");
    }
  }, [
    analytics,
    hardwareId,
    telemetrySettings.analyticsEnabled,
    version,
    modsState,
    profilesState,
  ]);

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
        app_version: version,
        total_mods_at_startup: Object.keys(modsState).length,
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

  const contextValue: AnalyticsContextType = {
    analytics,
  };

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
