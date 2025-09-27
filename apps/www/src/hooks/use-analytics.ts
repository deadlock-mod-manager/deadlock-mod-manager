import { usePostHog } from "posthog-js/react";

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
}

/**
 * Custom hook for PostHog analytics for the web application
 *
 * This hook initializes PostHog and provides methods for tracking events.
 * It respects user privacy settings and only tracks when analytics are enabled.
 */
export const useAnalytics = (): UseAnalyticsReturn => {
  const posthog = usePostHog();

  const capture = async (
    event: string,
    properties?: PostHogProperties,
  ): Promise<void> => {
    try {
      posthog.capture(event, properties);
    } catch (error) {
      console.warn("PostHog capture failed:", error);
    }
  };

  const identify = async (
    distinctId: string,
    properties?: PostHogUserProperties,
  ): Promise<void> => {
    try {
      posthog.identify(distinctId, properties);
    } catch (error) {
      console.warn("PostHog identify failed:", error);
    }
  };

  return {
    capture,
    identify,
  };
};
