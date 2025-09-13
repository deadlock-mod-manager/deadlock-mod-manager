// Re-export telemetry hooks for easier imports

// Export types for external use
export type {
  PostHogProperties,
  PostHogUserProperties,
  UseAnalyticsReturn as UsePostHogReturn,
} from './use-posthog';
export { useAnalytics as usePostHog } from './use-posthog';
