import { useCallback } from "react";
import useAbout from "@/hooks/use-about";
import logger from "@/lib/logger";
import { useAnalytics } from "./use-analytics";

// Analytics property types
interface BaseAnalyticsProperties {
  [key: string]: string | number | boolean | null | undefined;
}

interface UserProperties extends BaseAnalyticsProperties {
  platform?: string;
  app_version?: string;
  total_mods_installed?: number;
  total_profiles_created?: number;
  first_identified_at?: string;
}

interface ModDownloadProperties extends BaseAnalyticsProperties {
  mod_size_mb?: number;
  download_duration_seconds?: number;
  file_count?: number;
}

interface ModInstallProperties extends BaseAnalyticsProperties {
  installation_duration_seconds?: number;
  vpk_count?: number;
  file_tree_complexity?: "simple" | "complex";
}

interface AppStartProperties extends BaseAnalyticsProperties {
  app_version?: string;
  total_mods_at_startup?: number;
  total_profiles_at_startup?: number;
}

interface PageViewProperties extends BaseAnalyticsProperties {
  timestamp?: string;
}

interface ErrorProperties extends BaseAnalyticsProperties {
  error_type?: string;
  error_message?: string;
  context?: string;
  timestamp?: string;
}

interface PerformanceProperties extends BaseAnalyticsProperties {
  metric_name?: string;
  value?: number;
  unit?: string;
  timestamp?: string;
}

interface FeatureProperties extends BaseAnalyticsProperties {
  feature_name?: string;
  timestamp?: string;
}

/**
 * Analytics events for the mod manager application
 * This hook provides typed event tracking methods for key user interactions
 */
export const useAnalyticsEvents = () => {
  const { capture, identify, isEnabled } = useAnalytics();
  const { version } = useAbout();

  // User identification and properties
  const identifyUser = useCallback(
    async (hardwareId: string, properties?: UserProperties) => {
      if (!isEnabled) return;

      try {
        await identify(hardwareId, {
          platform: "desktop",
          app_version: version || "unknown",
          ...properties,
        });
        logger.info("User identified for analytics", {
          hardwareId: `${hardwareId.slice(0, 8)}...`,
        });
      } catch (error) {
        logger.warn("Failed to identify user for analytics", error);
      }
    },
    [identify, isEnabled, version],
  );

  // App lifecycle events
  const trackAppStarted = useCallback(
    async (properties?: AppStartProperties) => {
      await capture("app_started", {
        timestamp: new Date().toISOString(),
        ...properties,
      });
    },
    [capture],
  );

  const trackAppClosed = useCallback(
    async (sessionDuration?: number) => {
      await capture("app_closed", {
        session_duration_seconds: sessionDuration,
        timestamp: new Date().toISOString(),
      });
    },
    [capture],
  );

  // Navigation events
  const trackPageViewed = useCallback(
    async (pageName: string, properties?: PageViewProperties) => {
      await capture("page_viewed", {
        page: pageName,
        timestamp: new Date().toISOString(),
        ...properties,
      });
    },
    [capture],
  );

  // Mod interaction events
  const trackModDiscovered = useCallback(
    async (
      modId: string,
      source: "browse" | "search" | "deep_link" | "profile",
      searchQuery?: string,
    ) => {
      await capture("mod_discovered", {
        mod_id: modId,
        discovery_source: source,
        search_query: searchQuery,
        timestamp: new Date().toISOString(),
      });
    },
    [capture],
  );

  const trackModDownloaded = useCallback(
    async (modId: string, properties?: ModDownloadProperties) => {
      await capture("mod_downloaded", {
        mod_id: modId,
        timestamp: new Date().toISOString(),
        ...properties,
      });
    },
    [capture],
  );

  const trackModInstalled = useCallback(
    async (modId: string, properties?: ModInstallProperties) => {
      await capture("mod_installed", {
        mod_id: modId,
        timestamp: new Date().toISOString(),
        ...properties,
      });
    },
    [capture],
  );

  const trackModUninstalled = useCallback(
    async (modId: string, reason?: "user_choice" | "error" | "conflict") => {
      await capture("mod_uninstalled", {
        mod_id: modId,
        uninstall_reason: reason || "user_choice",
        timestamp: new Date().toISOString(),
      });
    },
    [capture],
  );

  const trackModEnabled = useCallback(
    async (modId: string, profileId?: string) => {
      await capture("mod_enabled", {
        mod_id: modId,
        profile_id: profileId,
        timestamp: new Date().toISOString(),
      });
    },
    [capture],
  );

  const trackModDisabled = useCallback(
    async (modId: string, profileId?: string) => {
      await capture("mod_disabled", {
        mod_id: modId,
        profile_id: profileId,
        timestamp: new Date().toISOString(),
      });
    },
    [capture],
  );

  // Profile management events
  const trackProfileCreated = useCallback(
    async (profileId: string, modCount: number) => {
      await capture("profile_created", {
        profile_id: profileId,
        initial_mod_count: modCount,
        timestamp: new Date().toISOString(),
      });
    },
    [capture],
  );

  const trackProfileShared = useCallback(
    async (
      profileId: string,
      modCount: number,
      shareMethod: "link" | "export",
    ) => {
      await capture("profile_shared", {
        profile_id: profileId,
        mod_count: modCount,
        share_method: shareMethod,
        timestamp: new Date().toISOString(),
      });
    },
    [capture],
  );

  const trackProfileImported = useCallback(
    async (
      modCount: number,
      importMethod: "link" | "file",
      success: boolean,
    ) => {
      await capture("profile_imported", {
        mod_count: modCount,
        import_method: importMethod,
        success,
        timestamp: new Date().toISOString(),
      });
    },
    [capture],
  );

  // Search and discovery events
  const trackSearch = useCallback(
    async (query: string, resultCount: number, category?: string) => {
      await capture("search_performed", {
        search_query: query,
        result_count: resultCount,
        category,
        query_length: query.length,
        timestamp: new Date().toISOString(),
      });
    },
    [capture],
  );

  const trackFilterApplied = useCallback(
    async (filterType: string, filterValue: string, resultCount: number) => {
      await capture("filter_applied", {
        filter_type: filterType,
        filter_value: filterValue,
        result_count: resultCount,
        timestamp: new Date().toISOString(),
      });
    },
    [capture],
  );

  // Settings and preferences events
  const trackSettingChanged = useCallback(
    async (settingKey: string, oldValue: unknown, newValue: unknown) => {
      await capture("setting_changed", {
        setting_key: settingKey,
        old_value:
          typeof oldValue === "object"
            ? JSON.stringify(oldValue)
            : String(oldValue),
        new_value:
          typeof newValue === "object"
            ? JSON.stringify(newValue)
            : String(newValue),
        timestamp: new Date().toISOString(),
      });
    },
    [capture],
  );

  const trackLanguageChanged = useCallback(
    async (oldLanguage: string, newLanguage: string) => {
      await capture("language_changed", {
        old_language: oldLanguage,
        new_language: newLanguage,
        timestamp: new Date().toISOString(),
      });
    },
    [capture],
  );

  // Error and performance events
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

  const trackPerformanceMetric = useCallback(
    async (
      metricName: string,
      value: number,
      unit: string,
      context?: PerformanceProperties,
    ) => {
      await capture("performance_metric", {
        metric_name: metricName,
        value,
        unit,
        timestamp: new Date().toISOString(),
        ...context,
      });
    },
    [capture],
  );

  // Feature usage events
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

  // Deep link events
  const trackDeepLinkUsed = useCallback(
    async (modId: string, source: string) => {
      await capture("deep_link_used", {
        mod_id: modId,
        source,
        timestamp: new Date().toISOString(),
      });
    },
    [capture],
  );

  // Addon analysis events
  const trackAddonAnalysisStarted = useCallback(
    async (fileCount: number) => {
      await capture("addon_analysis_started", {
        file_count: fileCount,
        timestamp: new Date().toISOString(),
      });
    },
    [capture],
  );

  const trackAddonAnalysisCompleted = useCallback(
    async (
      fileCount: number,
      identifiedCount: number,
      durationSeconds: number,
    ) => {
      await capture("addon_analysis_completed", {
        file_count: fileCount,
        identified_count: identifiedCount,
        duration_seconds: durationSeconds,
        success_rate: identifiedCount / fileCount,
        timestamp: new Date().toISOString(),
      });
    },
    [capture],
  );

  // Profile switching events
  const trackProfileSwitched = useCallback(
    async (
      fromProfileName: string,
      toProfileName: string,
      properties?: {
        enabled_mods?: number;
        disabled_mods?: number;
        switch_duration_seconds?: number;
        errors?: string[];
      },
    ) => {
      const analyticsProperties: Record<
        string,
        string | number | boolean | null | undefined
      > = {
        from_profile: fromProfileName,
        to_profile: toProfileName,
        timestamp: new Date().toISOString(),
        enabled_mods: properties?.enabled_mods,
        disabled_mods: properties?.disabled_mods,
        switch_duration_seconds: properties?.switch_duration_seconds,
      };

      if (properties?.errors && properties.errors.length > 0) {
        analyticsProperties.errors = properties.errors.join(", ");
        analyticsProperties.error_count = properties.errors.length;
      }

      await capture("profile_switched", analyticsProperties);
    },
    [capture],
  );

  // Mod ordering events
  const trackModsReordered = useCallback(
    async (properties?: {
      mod_count?: number;
      reorder_method?: "drag_drop" | "manual";
      duration_seconds?: number;
    }) => {
      await capture("mods_reordered", {
        timestamp: new Date().toISOString(),
        ...properties,
      });
    },
    [capture],
  );

  return {
    // User identification
    identifyUser,

    // App lifecycle
    trackAppStarted,
    trackAppClosed,

    // Navigation
    trackPageViewed,

    // Mod interactions
    trackModDiscovered,
    trackModDownloaded,
    trackModInstalled,
    trackModUninstalled,
    trackModEnabled,
    trackModDisabled,

    // Profile management
    trackProfileCreated,
    trackProfileShared,
    trackProfileImported,

    // Search and discovery
    trackSearch,
    trackFilterApplied,

    // Settings
    trackSettingChanged,
    trackLanguageChanged,

    // Error and performance
    trackError,
    trackPerformanceMetric,

    // Features
    trackFeatureUsed,

    // Deep links
    trackDeepLinkUsed,

    // Addon analysis
    trackAddonAnalysisStarted,
    trackAddonAnalysisCompleted,

    // Profile switching
    trackProfileSwitched,

    // Mod ordering
    trackModsReordered,

    // Utility
    isEnabled,
  };
};
