import { useEffect } from "react";
import { useAnalyticsContext } from "../contexts/analytics-context";

/**
 * Hook to track page views automatically
 * Should be used in route components to track navigation
 */
export const usePageTracking = (pageName: string, properties?: Record<string, string | number | boolean>) => {
  const { analytics } = useAnalyticsContext();

  useEffect(() => {
    if (analytics.isEnabled) {
      analytics.trackPageViewed(pageName, {
        path: window.location.pathname,
        search: window.location.search,
        hash: window.location.hash,
        ...properties,
      });
    }
  }, [pageName, analytics, properties]);
};
