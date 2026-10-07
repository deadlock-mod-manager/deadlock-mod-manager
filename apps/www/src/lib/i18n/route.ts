import { useRouteContext, useRouterState } from "@tanstack/react-router";
import type { i18n } from "i18next";
import type { Namespace } from "./instance";
import {
  getLocaleConfig,
  isLocalizedPath,
  LOCALE_COOKIE,
  type Locale,
  type LocaleState,
  localizePath,
} from "./locales";

interface I18nRouterContext {
  i18n: i18n;
  locale: LocaleState;
}

/**
 * Translator and locale for a route's `head()`, which runs outside React:
 *
 *   head: ({ match }) => {
 *     const { t, locale } = headI18n(match, "guide-mods");
 *     return guideHead(getPage(t), locale);
 *   }
 */
export const headI18n = <N extends Namespace>(
  match: { context: I18nRouterContext },
  ns: N,
) => ({
  t: match.context.i18n.getFixedT(null, ns),
  locale: match.context.locale.current,
});

/** The language the current page renders in. */
export const useLocale = (): Locale =>
  useRouteContext({ from: "__root__" }).locale.current;

/** Number formatting in the active language (download counts, stats). */
export const useNumberFormat = (options?: Intl.NumberFormatOptions) =>
  new Intl.NumberFormat(getLocaleConfig(useLocale()).hreflang, options);

/**
 * Where each language's version of the current page lives. Untranslated
 * pages (legal, dashboard) keep their URL; the choice is remembered in a
 * cookie and applies from the next translated page on.
 */
export const useLocaleLinks = () => {
  const { pathname, searchStr, hash } = useRouterState({
    select: (state) => state.location,
  });
  const suffix = `${searchStr}${hash ? `#${hash}` : ""}`;
  return (locale: Locale) =>
    isLocalizedPath(pathname)
      ? `${localizePath(pathname, locale)}${suffix}`
      : `${pathname}${suffix}`;
};

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Records an explicit choice so first-visit detection stops redirecting. */
export const rememberLocale = (locale: Locale) => {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
};
