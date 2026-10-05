import * as Sentry from "@sentry/tanstackstart-react";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { AnalyticsProvider } from "./components/analytics-provider";
import {
  NotFoundComponent,
  RouteErrorComponent,
} from "./components/route-fallbacks";
import * as TanstackQuery from "./integrations/tanstack-query/root-provider";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const rqContext = TanstackQuery.getContext();

  const router = createRouter({
    routeTree,
    context: { ...rqContext },
    // Hovering or focusing a link loads the route's code and data, so the
    // click usually renders instantly.
    defaultPreload: "intent",
    // React Query owns caching (see staleTime in root-provider); always hand
    // preloads to the loaders and let the query cache decide what to refetch.
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: RouteErrorComponent,
    defaultNotFoundComponent: NotFoundComponent,
    scrollRestoration: true,
    Wrap: (props: { children: React.ReactNode }) => {
      return (
        <AnalyticsProvider>
          <TanstackQuery.Provider {...rqContext}>
            {props.children}
          </TanstackQuery.Provider>
        </AnalyticsProvider>
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
