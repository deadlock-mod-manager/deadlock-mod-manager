import * as Sentry from "@sentry/tanstackstart-react";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { I18nextProvider } from "react-i18next";
import { AnalyticsProvider } from "./components/analytics-provider";
import {
  NotFoundComponent,
  RouteErrorComponent,
} from "./components/route-fallbacks";
import * as TanstackQuery from "./integrations/tanstack-query/root-provider";
import { createI18n, ensureLocale } from "./lib/i18n/instance";
import {
  DEFAULT_LOCALE,
  delocalizePath,
  isLocalizedPath,
  type Locale,
  type LocaleState,
  localizePath,
} from "./lib/i18n/locales";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const rqContext = TanstackQuery.getContext();
  const i18n = createI18n();
  const localeState: LocaleState = { current: DEFAULT_LOCALE };

  const setLocale = (locale: Locale) => {
    if (locale === localeState.current) return;
    localeState.current = locale;
    i18n.changeLanguage(locale);
    void ensureLocale(i18n, locale).then(() => i18n.changeLanguage(locale));
  };

  const router = createRouter({
    routeTree,
    context: { ...rqContext, i18n, locale: localeState },
    hydrate: async () => {
      await ensureLocale(i18n, localeState.current);
    },
    rewrite: {
      input: ({ url }) => {
        const { locale, path } = delocalizePath(url.pathname);
        if (locale) {
          setLocale(locale);
          url.pathname = path;
        } else if (isLocalizedPath(url.pathname)) {
          setLocale(DEFAULT_LOCALE);
        }
        return url;
      },
      output: ({ url }) => {
        url.pathname = localizePath(url.pathname, localeState.current);
        return url;
      },
    },
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: RouteErrorComponent,
    defaultNotFoundComponent: NotFoundComponent,
    scrollRestoration: true,
    Wrap: (props: { children: React.ReactNode }) => {
      return (
        <I18nextProvider i18n={i18n}>
          <AnalyticsProvider>
            <TanstackQuery.Provider {...rqContext}>
              {props.children}
            </TanstackQuery.Provider>
          </AnalyticsProvider>
        </I18nextProvider>
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
