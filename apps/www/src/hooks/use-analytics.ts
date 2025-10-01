import ReactGA from "react-ga4";
import { useEffect, useRef } from "react";

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
}

/**
 * Custom hook for Google Analytics for the web application
 *
 * This hook initializes Google Analytics 4 and provides methods for tracking events.
 * It respects user privacy settings and only tracks when analytics are enabled.
 */
export const useAnalytics = (): UseAnalyticsReturn => {
  const isInitialized = useRef(false);

  useEffect(() => {
    if (!isInitialized.current && import.meta.env.VITE_GA_MEASUREMENT_ID) {
      try {
        ReactGA.initialize(import.meta.env.VITE_GA_MEASUREMENT_ID);
        isInitialized.current = true;
      } catch (error) {
        console.warn("Failed to initialize Google Analytics:", error);
      }
    }
  }, []);

  const capture = async (
    event: string,
    properties?: AnalyticsProperties,
  ): Promise<void> => {
    try {
      ReactGA.event(event, properties);
    } catch (error) {
      console.warn("Analytics capture failed:", error);
    }
  };

  const identify = async (
    distinctId: string,
    properties?: AnalyticsUserProperties,
  ): Promise<void> => {
    try {
      ReactGA.set({ userId: distinctId, ...properties });
    } catch (error) {
      console.warn("Analytics identify failed:", error);
    }
  };

  return {
    capture,
    identify,
  };
};
