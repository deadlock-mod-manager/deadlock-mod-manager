import { createServerFn } from "@tanstack/react-start";
import { getCookie, getRequestHeader } from "@tanstack/react-start/server";
import { DEFAULT_LOCALE, LOCALE_COOKIE, matchAcceptLanguage } from "./locales";

const BOT_USER_AGENT =
  /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|lighthouse|headless/i;

export const detectPreferredLocale = createServerFn({ method: "GET" }).handler(
  () => {
    if (getCookie(LOCALE_COOKIE)) return null;
    if (BOT_USER_AGENT.test(getRequestHeader("user-agent") ?? "")) return null;
    const locale = matchAcceptLanguage(getRequestHeader("accept-language"));
    return locale && locale !== DEFAULT_LOCALE ? locale : null;
  },
);
