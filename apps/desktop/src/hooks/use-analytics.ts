import { useLayoutEffect, useMemo } from "react";
import useAbout from "@/hooks/use-about";
import {
  analytics,
  configureAnalytics,
  identifyAnalytics,
} from "@/lib/analytics";
import { usePersistedStore } from "@/lib/store";

export interface UseAnalyticsReturn {
  track: typeof analytics.track;
  identify: (distinctId: string) => void;
  isEnabled: boolean;
}

export const useAnalytics = (): UseAnalyticsReturn => {
  const enabled = usePersistedStore(
    (state) => state.telemetrySettings.analyticsEnabled,
  );
  const { data } = useAbout();
  useLayoutEffect(() => {
    if (data) configureAnalytics(data.version, data.releaseChannel);
  }, [data]);
  const isEnabled =
    enabled &&
    !!data &&
    !!import.meta.env.VITE_GA_MEASUREMENT_ID &&
    !import.meta.env.DEV &&
    import.meta.env.VITE_DMM_E2E_HARNESS !== "1";
  return useMemo(
    () => ({
      track: analytics.track,
      identify: identifyAnalytics,
      isEnabled,
    }),
    [isEnabled],
  );
};
