import { useEffect, useRef } from "react";
import ReactGA from "react-ga4";
import useAbout from "@/hooks/use-about";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";

export interface AnalyticsProperties {
  [key: string]: string | number | boolean | null | undefined;
}

export interface AnalyticsUserProperties {
  [key: string]: string | number | boolean | null | undefined;
}

export interface UseAnalyticsReturn {
  /**
   * Capture an event with properties if telemetry is enabled
   */
  capture: (event: string, properties?: AnalyticsProperties) => Promise<void>;
  /**
   * Identify a user with properties if telemetry is enabled
   */
  identify: (
    distinctId: string,
    properties?: AnalyticsUserProperties,
  ) => Promise<void>;
  /**
   * Whether Google Analytics telemetry is currently enabled
   */
  isEnabled: boolean;
}

/**
 * Custom hook for Google Analytics that respects telemetry settings
 *
 * This hook wraps Google Analytics 4 calls and only executes them if the user
 * has enabled usage analytics in their privacy settings.
 */
export const useAnalytics = (): UseAnalyticsReturn => {
  const telemetrySettings = usePersistedStore(
    (state) => state.telemetrySettings,
  );
  const { version } = useAbout();
  const isInitialized = useRef(false);

  useEffect(() => {
    if (
      telemetrySettings.analyticsEnabled &&
      !isInitialized.current &&
      import.meta.env.VITE_GA_MEASUREMENT_ID
    ) {
      try {
        ReactGA.initialize(import.meta.env.VITE_GA_MEASUREMENT_ID);
        isInitialized.current = true;
        logger.info("Google Analytics initialized");
      } catch (error) {
        logger.warn("Failed to initialize Google Analytics", error);
      }
    }
  }, [telemetrySettings.analyticsEnabled]);

  const capture = async (
    event: string,
    properties?: AnalyticsProperties,
  ): Promise<void> => {
    if (!telemetrySettings.analyticsEnabled) {
      logger.debug("Analytics capture skipped because telemetry is disabled");
      return;
    }

    try {
      ReactGA.event(event, {
        app_version: version || "unknown",
        ...properties,
      });
    } catch (error) {
      logger.warn("Analytics capture failed:", error);
    }
  };

  const identify = async (
    distinctId: string,
    properties?: AnalyticsUserProperties,
  ): Promise<void> => {
    if (!telemetrySettings.analyticsEnabled) {
      logger.debug("Analytics identify skipped because telemetry is disabled");
      return;
    }

    try {
      ReactGA.set({ userId: distinctId, ...properties });
      logger.debug("User identified for analytics");
    } catch (error) {
      logger.warn("Analytics identify failed:", error);
    }
  };

  return {
    capture,
    identify,
    isEnabled: telemetrySettings.analyticsEnabled,
  };
};
