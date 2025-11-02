import * as Sentry from "@sentry/tanstackstart-react";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { AnalyticsProvider } from "./components/analytics-provider";
import { ThemeProvider } from "./components/theme-provider";
import * as TanstackQuery from "./integrations/tanstack-query/root-provider";
// Import the generated route tree
import { routeTree } from "./routeTree.gen";
// Create a new router instance
export const getRouter = () => {
  const rqContext = TanstackQuery.getContext();

  const router = createRouter({
    routeTree,
    context: { ...rqContext },
    defaultPreload: "intent",
    Wrap: (props: { children: React.ReactNode }) => {
      return (
        <ThemeProvider
          attribute='class'
          defaultTheme='dark'
          disableTransitionOnChange
          storageKey='vite-ui-theme'>
          <AnalyticsProvider>
            <TanstackQuery.Provider {...rqContext}>
              {props.children}
            </TanstackQuery.Provider>
          </AnalyticsProvider>
        </ThemeProvider>
      );
    },
  });

  setupRouterSsrQueryIntegration({
    router,
    queryClient: rqContext.queryClient,
  });

  if (!router.isServer) {
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      integrations: [],
    });
  }

  return router;
};
