import { useEffect, useRef } from "react";
import { useLocation } from "react-router";
import { useAnalyticsContext } from "@/contexts/analytics-context";
import { screenName } from "@/lib/analytics/client";

export const usePageTracking = () => {
  const { pathname } = useLocation();
  const { analytics } = useAnalyticsContext();
  const previousScreen = useRef("");
  const page = screenName(pathname);
  useEffect(() => {
    if (!analytics.isEnabled || previousScreen.current === page) return;
    analytics.trackPageViewed(page);
    previousScreen.current = page;
  }, [page, analytics]);
};
