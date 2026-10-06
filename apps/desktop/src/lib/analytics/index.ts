import type {
  AnalyticsEvents,
  AnalyticsMilestone,
  EventArguments,
} from "./schema";
import { createInstallTracker } from "./install";
import ReactGA from "react-ga4";
import { platform } from "@tauri-apps/plugin-os";
import { usePersistedStore } from "@/lib/store";
import { createAnalyticsClient } from "./client";

const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID;
let version: string | undefined;
let releaseChannel = "unknown";
let consentEpoch = 0;
let initialized = false;

const isEnabled = () =>
  !!measurementId &&
  !import.meta.env.DEV &&
  import.meta.env.VITE_DMM_E2E_HARNESS !== "1" &&
  usePersistedStore.getState().telemetrySettings.analyticsEnabled;
const syncConsent = () => {
  try {
    if (typeof window !== "undefined" && measurementId) {
      Reflect.set(
        window,
        `ga-disable-${measurementId}`,
        !isEnabled() || !version,
      );
    }
  } catch {
    // Preference updates and app startup must still work when GA is unavailable.
  }
};
usePersistedStore.subscribe((state, previous) => {
  if (
    state.telemetrySettings.analyticsEnabled !==
    previous.telemetrySettings.analyticsEnabled
  ) {
    consentEpoch += 1;
    syncConsent();
  }
});
syncConsent();

export const configureAnalytics = (appVersion: string, channel: string) => {
  version = appVersion;
  releaseChannel = channel;
  syncConsent();
};

const initialize = () => {
  if (!initialized && measurementId) {
    ReactGA.initialize(measurementId, {
      gtagOptions: {
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
      },
    });
    initialized = true;
  }
};

export const analytics = createAnalyticsClient({
  getContext: () => {
    const enabled = isEnabled();
    return {
      enabled,
      version,
      os: enabled && version ? platform() : "unknown",
      releaseChannel,
      consentEpoch,
    };
  },
  send: (event, properties) => {
    initialize();
    ReactGA.event(event, properties);
  },
  now: () => Date.now(),
  createId: () => crypto.randomUUID(),
});

export const identifyAnalytics = (distinctId: string): void => {
  try {
    if (!isEnabled() || !version) return;
    initialize();
    ReactGA.set({ userId: distinctId });
  } catch {
    // Analytics must never block a user action.
  }
};

export const captureMilestone = <K extends AnalyticsMilestone>(
  milestone: K,
  ...args: EventArguments<K>
) => {
  try {
    const state = usePersistedStore.getState();
    if (state.telemetrySettings.analyticsMilestones?.[milestone]) return;
    if (analytics.track(milestone, ...args)) {
      state.updateTelemetrySettings({
        analyticsMilestones: {
          ...state.telemetrySettings.analyticsMilestones,
          [milestone]: true,
        },
      });
    }
  } catch {
    // A failed persistence write must not interrupt installation or launch.
  }
};

export const trackAppReady = (
  properties: AnalyticsEvents["app_ready"],
): void => {
  if (analytics.track("app_ready", properties)) {
    captureMilestone("first_eligible_use", {
      has_existing_mods: usePersistedStore.getState().localMods.length > 0,
    });
  }
};

export const trackInstallOptions = createInstallTracker({
  start: analytics.start,
  captureMilestone,
});
