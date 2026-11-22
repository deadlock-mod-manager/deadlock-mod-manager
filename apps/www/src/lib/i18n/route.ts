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

export const headI18n = <N extends Namespace>(
  match: { context: I18nRouterContext },
  ns: N,
) => ({
  t: match.context.i18n.getFixedT(null, ns),
  locale: match.context.locale.current,
});

export const useLocale = (): Locale =>
  useRouteContext({ from: "__root__" }).locale.current;

export const useNumberFormat = (options?: Intl.NumberFormatOptions) =>
  new Intl.NumberFormat(getLocaleConfig(useLocale()).hreflang, options);

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

export const rememberLocale = (locale: Locale) => {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
};
