import { createServerFn } from "@tanstack/react-start";
import { getCookie, getRequestHeader } from "@tanstack/react-start/server";
import { DEFAULT_LOCALE, LOCALE_COOKIE, matchAcceptLanguage } from "./locales";

// Crawlers must always get the URL they asked for, or the English pages would
// disappear from the index behind redirects.
const BOT_USER_AGENT =
  /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|lighthouse|headless/i;

/**
 * The visitor's preferred language for an unprefixed (English) page, or null
 * to stay in English. Only first visits are redirected: once someone picks a
 * language in the switcher, the cookie wins.
 */
export const detectPreferredLocale = createServerFn({ method: "GET" }).handler(
  () => {
    if (getCookie(LOCALE_COOKIE)) return null;
    if (BOT_USER_AGENT.test(getRequestHeader("user-agent") ?? "")) return null;
    const locale = matchAcceptLanguage(getRequestHeader("accept-language"));
    return locale && locale !== DEFAULT_LOCALE ? locale : null;
  },
);
