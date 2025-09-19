import { PostHog } from "tauri-plugin-posthog-api";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";

export interface PostHogProperties {
  [key: string]: string | number | boolean | null | undefined;
}

export interface PostHogUserProperties {
  [key: string]: string | number | boolean | null | undefined;
}

export interface UseAnalyticsReturn {
  /**
   * Capture an event with properties if telemetry is enabled
   */
  capture: (event: string, properties?: PostHogProperties) => Promise<void>;
  /**
   * Identify a user with properties if telemetry is enabled
   */
  identify: (
    distinctId: string,
    properties?: PostHogUserProperties,
  ) => Promise<void>;
  /**
   * Whether PostHog telemetry is currently enabled
   */
  isEnabled: boolean;
}

/**
 * Custom hook for PostHog analytics that respects telemetry settings
 *
 * This hook wraps PostHog API calls and only executes them if the user
 * has enabled usage analytics in their privacy settings.
 */
export const useAnalytics = (): UseAnalyticsReturn => {
  const telemetrySettings = usePersistedStore(
    (state) => state.telemetrySettings,
  );

  const capture = async (
    event: string,
    properties?: PostHogProperties,
  ): Promise<void> => {
    if (!telemetrySettings.posthogEnabled) {
      logger.info("PostHog capture skipped because telemetry is disabled");
      return;
    }

    try {
      await PostHog.capture(event, properties);
      logger.info("PostHog capture successful");
    } catch (error) {
      logger.warn("PostHog capture failed:", error);
    }
  };

  const identify = async (
    distinctId: string,
    properties?: PostHogUserProperties,
  ): Promise<void> => {
    if (!telemetrySettings.posthogEnabled) {
      logger.info("PostHog identify skipped because telemetry is disabled");
      return;
    }

    try {
      await PostHog.identify(distinctId, properties);
    } catch (error) {
      logger.warn("PostHog identify failed:", error);
    }
  };

  return {
    capture,
    identify,
    isEnabled: telemetrySettings.posthogEnabled,
  };
};
