import { trackAppReady } from "@/lib/analytics";
import { useMemo } from "react";
import { useAnalytics } from "./use-analytics";
import type { AnalyticsProperties } from "@/lib/analytics/client";

export const useAnalyticsEvents = () => {
  const { capture, identify, isEnabled } = useAnalytics();
  return useMemo(
    () => ({
      isEnabled,
      identifyUser: (hardwareId: string, userId?: string) =>
        identify(userId ?? hardwareId),
      trackAppStarted: trackAppReady,
      trackPageViewed: (page: string, properties?: AnalyticsProperties) =>
        capture("page_viewed", { page, ...properties }),
      trackProfileCreated: (_profileId: string, modCount: number) =>
        capture("profile_created", { initial_mod_count: modCount }),
      trackProfileShared: (
        _profileId: string,
        modCount: number,
        shareMethod: "link" | "export",
      ) =>
        capture("profile_shared", {
          mod_count: modCount,
          share_method: shareMethod,
        }),
      trackSettingChanged: (
        settingKey: string,
        _oldValue: boolean,
        newValue: boolean,
      ) =>
        capture("setting_changed", {
          setting_key: settingKey,
          enabled: newValue,
        }),
      trackAddonAnalysisStarted: (fileCount: number) =>
        capture("addon_analysis_started", { file_count: fileCount }),
      trackAddonAnalysisCompleted: (
        fileCount: number,
        identifiedCount: number,
        durationSeconds: number,
      ) =>
        capture("addon_analysis_completed", {
          file_count: fileCount,
          identified_count: identifiedCount,
          duration_seconds: durationSeconds,
          identification_rate: fileCount > 0 ? identifiedCount / fileCount : 0,
        }),
      trackProfileSwitched: (
        _fromProfile: string,
        _toProfile: string,
        properties?: {
          enabled_mods?: number;
          disabled_mods?: number;
          switch_duration_seconds?: number;
          errors?: string[];
        },
      ) =>
        capture("profile_switched", {
          enabled_mods: properties?.enabled_mods,
          disabled_mods: properties?.disabled_mods,
          duration_seconds: properties?.switch_duration_seconds,
        }),
      trackModsReordered: (properties?: {
        mod_count?: number;
        reorder_method?: "drag_drop" | "manual";
        duration_seconds?: number;
      }) => capture("mods_reordered", properties),
    }),
    [capture, identify, isEnabled],
  );
};
