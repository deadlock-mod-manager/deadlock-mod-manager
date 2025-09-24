import {
  createContext,
  type FC,
  type ReactNode,
  useContext,
  useEffect,
} from "react";
import { useAnalyticsEvents } from "../hooks/use-analytics-events";

interface AnalyticsContextType {
  // The analytics events hook is re-exported for convenience
  analytics: ReturnType<typeof useAnalyticsEvents>;
}

const AnalyticsContext = createContext<AnalyticsContextType | null>(null);

interface AnalyticsProviderProps {
  children: ReactNode;
}

export const AnalyticsProvider: FC<AnalyticsProviderProps> = ({ children }) => {
  const analytics = useAnalyticsEvents();

  // Track initial page view when analytics is ready
  useEffect(() => {
    if (analytics.isEnabled) {
      const currentPath = window.location.pathname;
      const pageName = currentPath === "/" ? "home" : currentPath.slice(1);

      analytics.trackPageViewed(pageName, {
        path: currentPath,
        referrer: document.referrer,
      });
    }
  }, [analytics]);

  // Set up error boundary tracking
  useEffect(() => {
    if (!analytics.isEnabled) return;

    const handleError = (event: ErrorEvent) => {
      analytics.trackError("javascript_error", event.message, {
        context: "global_error_handler",
        filename: event.filename,
        line_number: event.lineno,
        column_number: event.colno,
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      analytics.trackError(
        "unhandled_promise_rejection",
        String(event.reason),
        {
          context: "promise_rejection_handler",
        },
      );
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener(
        "unhandledrejection",
        handleUnhandledRejection,
      );
    };
  }, [analytics]);

  const contextValue: AnalyticsContextType = {
    analytics,
  };

  return (
    <AnalyticsContext.Provider value={contextValue}>
      {children}
    </AnalyticsContext.Provider>
  );
};

export const useAnalyticsContext = (): AnalyticsContextType => {
  const context = useContext(AnalyticsContext);
  if (!context) {
    throw new Error(
      "useAnalyticsContext must be used within an AnalyticsProvider",
    );
  }
  return context;
};
