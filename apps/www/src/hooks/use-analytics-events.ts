import { useCallback } from "react";
import { useAnalytics } from "./use-posthog";

// Analytics property types
interface BaseAnalyticsProperties {
  [key: string]: string | number | boolean | null | undefined;
}

interface UserProperties extends BaseAnalyticsProperties {
  platform?: string;
  referrer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

interface PageViewProperties extends BaseAnalyticsProperties {
  path?: string;
  referrer?: string;
  timestamp?: string;
}

interface DownloadProperties extends BaseAnalyticsProperties {
  platform?: string;
  version?: string;
  download_type?: "installer" | "portable" | "source";
  referrer?: string;
}

interface FeatureProperties extends BaseAnalyticsProperties {
  feature_name?: string;
  timestamp?: string;
}

interface ErrorProperties extends BaseAnalyticsProperties {
  error_type?: string;
  error_message?: string;
  context?: string;
  timestamp?: string;
}

/**
 * Analytics events for the web application
 * This hook provides typed event tracking methods for key user interactions
 */
export const useAnalyticsEvents = () => {
  const { capture, identify, isEnabled } = useAnalytics();

  // User identification and properties
  const identifyUser = useCallback(
    async (userId: string, properties?: UserProperties) => {
      if (!isEnabled) return;

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
    [identify, isEnabled],
  );

  // Page navigation events
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

  // Download tracking events
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

  // User engagement events
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

  // VPK Analyzer events
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

  // Authentication events
  const trackSignInAttempted = useCallback(
    async (method: "email" | "oauth") => {
      await capture("sign_in_attempted", {
        method,
        timestamp: new Date().toISOString(),
      });
    },
    [capture],
  );

  const trackSignInCompleted = useCallback(
    async (method: "email" | "oauth", success: boolean) => {
      await capture("sign_in_completed", {
        method,
        success,
        timestamp: new Date().toISOString(),
      });
    },
    [capture],
  );

  const trackSignUpAttempted = useCallback(
    async (method: "email" | "oauth") => {
      await capture("sign_up_attempted", {
        method,
        timestamp: new Date().toISOString(),
      });
    },
    [capture],
  );

  const trackSignUpCompleted = useCallback(
    async (method: "email" | "oauth", success: boolean) => {
      await capture("sign_up_completed", {
        method,
        success,
        timestamp: new Date().toISOString(),
      });
    },
    [capture],
  );

  // Error tracking events
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

  // Content interaction events
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

  // Newsletter and engagement
  const trackNewsletterSignup = useCallback(
    async (email: string) => {
      await capture("newsletter_signup", {
        email_hash: btoa(email).substring(0, 8), // Simple hash for privacy
        timestamp: new Date().toISOString(),
      });
    },
    [capture],
  );

  return {
    // User identification
    identifyUser,

    // Navigation
    trackPageViewed,

    // Downloads
    trackDownloadStarted,
    trackDownloadCompleted,

    // Features
    trackFeatureUsed,
    trackLinkClicked,

    // VPK Analyzer
    trackVpkAnalysisStarted,
    trackVpkAnalysisCompleted,

    // Authentication
    trackSignInAttempted,
    trackSignInCompleted,
    trackSignUpAttempted,
    trackSignUpCompleted,

    // Errors
    trackError,

    // Content
    trackModPreviewViewed,
    trackSearchPerformed,

    // Engagement
    trackNewsletterSignup,

    // Utility
    isEnabled,
  };
};
