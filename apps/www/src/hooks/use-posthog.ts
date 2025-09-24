import posthog from "posthog-js";
import { useEffect, useRef, useState } from "react";

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
  /**
   * Whether PostHog has been initialized
   */
  isInitialized: boolean;
}

/**
 * Custom hook for PostHog analytics for the web application
 *
 * This hook initializes PostHog and provides methods for tracking events.
 * It respects user privacy settings and only tracks when analytics are enabled.
 */
export const useAnalytics = (): UseAnalyticsReturn => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const initializeRef = useRef(false);

  useEffect(() => {
    if (initializeRef.current) return;
    initializeRef.current = true;

    // Check if PostHog should be enabled (can be controlled via env var or localStorage)
    const enableAnalytics =
      import.meta.env.VITE_PUBLIC_POSTHOG_KEY &&
      import.meta.env.VITE_PUBLIC_POSTHOG_HOST &&
      localStorage.getItem("analytics-disabled") !== "true";

    if (enableAnalytics) {
      try {
        posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_KEY, {
          api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
          person_profiles: "identified_only",
          capture_pageview: false, // We'll handle this manually for better control
          capture_pageleave: true,
          loaded: () => {
            setIsInitialized(true);
            setIsEnabled(true);
          },
        });
      } catch (error) {
        console.warn("Failed to initialize PostHog:", error);
        setIsInitialized(true);
        setIsEnabled(false);
      }
    } else {
      setIsInitialized(true);
      setIsEnabled(false);
    }
  }, []);

  const capture = async (
    event: string,
    properties?: PostHogProperties,
  ): Promise<void> => {
    if (!isEnabled || !isInitialized) {
      return;
    }

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
    if (!isEnabled || !isInitialized) {
      return;
    }

    try {
      posthog.identify(distinctId, properties);
    } catch (error) {
      console.warn("PostHog identify failed:", error);
    }
  };

  return {
    capture,
    identify,
    isEnabled,
    isInitialized,
  };
};
