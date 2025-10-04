import { useCallback, useEffect, useRef } from "react";
import ReactGA from "react-ga4";
import type {
  DownloadProperties,
  ErrorProperties,
  FeatureProperties,
  PageViewProperties,
  UserProperties,
} from "@/types/analytics";

export interface AnalyticsProperties {
  [key: string]: string | number | boolean | null | undefined;
}

export interface AnalyticsUserProperties {
  [key: string]: string | number | boolean | null | undefined;
}

export const useAnalytics = () => {
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

  const capture = useCallback(
    async (event: string, properties?: AnalyticsProperties): Promise<void> => {
      try {
        ReactGA.event(event, properties);
      } catch (error) {
        console.warn("Analytics capture failed:", error);
      }
    },
    [],
  );

  const identify = useCallback(
    async (
      distinctId: string,
      properties?: AnalyticsUserProperties,
    ): Promise<void> => {
      try {
        ReactGA.set({ userId: distinctId, ...properties });
      } catch (error) {
        console.warn("Analytics identify failed:", error);
      }
    },
    [],
  );

  const identifyUser = useCallback(
    async (userId: string, properties?: UserProperties) => {
      try {
        await identify(userId, {
          platform: "web",
          referrer: document.referrer,
          ...properties,
        });
      } catch (error) {
        console.warn("Failed to identify user for analytics", error);
      }
    },
    [identify],
  );

  const trackPageViewed = useCallback(
    async (pageName: string, properties?: PageViewProperties) => {
      await capture("page_viewed", {
        page: pageName,
        path: window.location.pathname,
        referrer: document.referrer,
        timestamp: new Date().toISOString(),
        ...properties,
      });
    },
    [capture],
  );

  const trackDownloadStarted = useCallback(
    async (
      platform: string,
      version: string,
      properties?: DownloadProperties,
    ) => {
      await capture("download_started", {
        platform,
        version,
        referrer: document.referrer,
        timestamp: new Date().toISOString(),
        ...properties,
      });
    },
    [capture],
  );

  const trackDownloadCompleted = useCallback(
    async (
      platform: string,
      version: string,
      downloadType: "installer" | "portable" | "source",
      properties?: DownloadProperties,
    ) => {
      await capture("download_completed", {
        platform,
        version,
        download_type: downloadType,
        timestamp: new Date().toISOString(),
        ...properties,
      });
    },
    [capture],
  );

  const trackFeatureUsed = useCallback(
    async (featureName: string, properties?: FeatureProperties) => {
      await capture("feature_used", {
        feature_name: featureName,
        timestamp: new Date().toISOString(),
        ...properties,
      });
    },
    [capture],
  );

  const trackLinkClicked = useCallback(
    async (linkType: string, destination: string, context?: string) => {
      await capture("link_clicked", {
        link_type: linkType,
        destination,
        context,
        timestamp: new Date().toISOString(),
      });
    },
    [capture],
  );

  const trackVpkAnalysisStarted = useCallback(
    async (fileCount: number) => {
      await capture("vpk_analysis_started", {
        file_count: fileCount,
        timestamp: new Date().toISOString(),
      });
    },
    [capture],
  );

  const trackVpkAnalysisCompleted = useCallback(
    async (
      fileCount: number,
      identifiedCount: number,
      durationSeconds: number,
    ) => {
      await capture("vpk_analysis_completed", {
        file_count: fileCount,
        identified_count: identifiedCount,
        duration_seconds: durationSeconds,
        success_rate: identifiedCount / fileCount,
        timestamp: new Date().toISOString(),
      });
    },
    [capture],
  );

  const trackError = useCallback(
    async (
      errorType: string,
      errorMessage: string,
      context?: ErrorProperties,
    ) => {
      await capture("error_occurred", {
        error_type: errorType,
        error_message: errorMessage,
        timestamp: new Date().toISOString(),
        ...context,
      });
    },
    [capture],
  );

  const trackModPreviewViewed = useCallback(
    async (modId: string) => {
      await capture("mod_preview_viewed", {
        mod_id: modId,
        timestamp: new Date().toISOString(),
      });
    },
    [capture],
  );

  const trackSearchPerformed = useCallback(
    async (query: string, resultCount: number) => {
      await capture("search_performed", {
        search_query: query,
        result_count: resultCount,
        query_length: query.length,
        timestamp: new Date().toISOString(),
      });
    },
    [capture],
  );

  return {
    isEnabled:
      isInitialized.current && !!import.meta.env.VITE_GA_MEASUREMENT_ID,
    identifyUser,
    trackPageViewed,
    trackDownloadStarted,
    trackDownloadCompleted,
    trackFeatureUsed,
    trackLinkClicked,
    trackVpkAnalysisStarted,
    trackVpkAnalysisCompleted,
    trackError,
    trackModPreviewViewed,
    trackSearchPerformed,
  };
};
