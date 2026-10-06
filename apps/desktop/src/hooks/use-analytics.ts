import { useLayoutEffect, useMemo } from "react";
import useAbout from "@/hooks/use-about";
import {
  captureAnalytics,
  configureAnalytics,
  identifyAnalytics,
} from "@/lib/analytics";
import type { AnalyticsProperties } from "@/lib/analytics/client";
import { usePersistedStore } from "@/lib/store";

export type { AnalyticsProperties } from "@/lib/analytics/client";

export interface UseAnalyticsReturn {
  capture: (event: string, properties?: AnalyticsProperties) => Promise<void>;
  identify: (distinctId: string) => Promise<void>;
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
      capture: captureAnalytics,
      identify: identifyAnalytics,
      isEnabled,
    }),
    [isEnabled],
  );
};
