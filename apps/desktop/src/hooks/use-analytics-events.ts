import { trackAppReady } from "@/lib/analytics";
import { useMemo } from "react";
import { useAnalytics } from "./use-analytics";
import type { AnalyticsEvents } from "@/lib/analytics/schema";

export const useAnalyticsEvents = () => {
  const { track, identify, isEnabled } = useAnalytics();
  return useMemo(
    () => ({
      isEnabled,
      identifyUser: (hardwareId: string, userId?: string) =>
        identify(userId ?? hardwareId),
      trackAppStarted: trackAppReady,
      trackPageViewed: (
        page: string,
        properties?: Pick<AnalyticsEvents["page_viewed"], "tab">,
      ) => track("page_viewed", { page, ...properties }),
      trackProfileCreated: (_profileId: string, modCount: number) =>
        track("profile_created", { initial_mod_count: modCount }),
      trackProfileShared: (
        _profileId: string,
        modCount: number,
        shareMethod: "link" | "export",
      ) =>
        track("profile_shared", {
          mod_count: modCount,
          share_method: shareMethod,
        }),
      trackSettingChanged: (
        settingKey: string,
        _oldValue: boolean,
        newValue: boolean,
      ) =>
        track("setting_changed", {
          setting_key: settingKey,
          enabled: newValue,
        }),
      trackAddonAnalysisStarted: (fileCount: number) =>
        track("addon_analysis_started", { file_count: fileCount }),
      trackAddonAnalysisCompleted: (
        fileCount: number,
        identifiedCount: number,
        durationSeconds: number,
      ) =>
        track("addon_analysis_completed", {
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
        track("profile_switched", {
          enabled_mods: properties?.enabled_mods,
          disabled_mods: properties?.disabled_mods,
          duration_seconds: properties?.switch_duration_seconds,
        }),
      trackModsReordered: (properties?: {
        mod_count?: number;
        reorder_method?: "drag_drop" | "manual";
        duration_seconds?: number;
      }) => track("mods_reordered", properties),
    }),
    [track, identify, isEnabled],
  );
};
