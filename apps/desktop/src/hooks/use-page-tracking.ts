import { useEffect, useRef } from "react";
import { useLocation } from "react-router";
import { useAnalyticsContext } from "@/contexts/analytics-context";

/**
 * Hook to automatically track page views when the route changes
 */
export const usePageTracking = () => {
  const location = useLocation();
  const { analytics } = useAnalyticsContext();
  const previousPath = useRef<string>("");

  useEffect(() => {
    // Don't track on initial mount if path is the same
    if (location.pathname === previousPath.current) {
      return;
    }

    // Map routes to readable page names
    const getPageName = (pathname: string): string => {
      switch (pathname) {
        case "/":
          return "my-mods";
        case "/mods":
          return "browse-mods";
        case "/add-mods":
          return "add-mods";
        case "/downloads":
          return "downloads";
        case "/settings":
          return "settings";
        case "/debug":
          return "debug";
        default:
          // Handle dynamic routes or unknown paths
          if (pathname.startsWith("/mods/")) {
            return "mod-details";
          }
          return pathname.replace(/^\//, "") || "unknown";
      }
    };

    const pageName = getPageName(location.pathname);

    analytics.trackPageViewed(pageName, {
      path: location.pathname,
      search: location.search,
      previous_path: previousPath.current || undefined,
    });

    previousPath.current = location.pathname;
  }, [location.pathname, location.search, analytics]);
};
