/**
 * Languages the public site is translated into. English lives at unprefixed
 * URLs; every other locale gets a path prefix (`/ru/mods`). `file` is the
 * folder name under src/locales, which matches Crowdin's `%locale%` code.
 */
export const LOCALES = [
  {
    id: "en",
    file: "en",
    prefix: null,
    hreflang: "en",
    ogLocale: "en_US",
    name: "English",
  },
  {
    id: "ru",
    file: "ru-RU",
    prefix: "ru",
    hreflang: "ru",
    ogLocale: "ru_RU",
    name: "Русский",
  },
  {
    id: "pt-BR",
    file: "pt-BR",
    prefix: "pt-br",
    hreflang: "pt-BR",
    ogLocale: "pt_BR",
    name: "Português (Brasil)",
  },
  {
    id: "pl",
    file: "pl-PL",
    prefix: "pl",
    hreflang: "pl",
    ogLocale: "pl_PL",
    name: "Polski",
  },
  {
    id: "de",
    file: "de-DE",
    prefix: "de",
    hreflang: "de",
    ogLocale: "de_DE",
    name: "Deutsch",
  },
  {
    id: "fr",
    file: "fr-FR",
    prefix: "fr",
    hreflang: "fr",
    ogLocale: "fr_FR",
    name: "Français",
  },
  {
    id: "es",
    file: "es-ES",
    prefix: "es",
    hreflang: "es",
    ogLocale: "es_ES",
    name: "Español",
  },
] as const;

export type LocaleConfig = (typeof LOCALES)[number];
export type Locale = LocaleConfig["id"];

export const DEFAULT_LOCALE = "en" satisfies Locale;

/** Cookie that records an explicit language choice from the switcher. */
export const LOCALE_COOKIE = "dmm_locale";

/** The active language, owned by the router and read by routes. */
export interface LocaleState {
  current: Locale;
}

export interface DelocalizedPath {
  /** Null when the URL has no (valid) language prefix. */
  locale: Locale | null;
  path: string;
}

export const getLocaleConfig = (id: Locale): LocaleConfig =>
  LOCALES.find((locale) => locale.id === id) ?? LOCALES[0];

/**
 * Pages that exist in every language. Legal pages, the dashboard, auth and
 * redirect routes stay English-only at their unprefixed URLs.
 */
const LOCALIZED_PATHS = [
  "/",
  "/download",
  "/download/windows",
  "/download/linux",
  "/mods",
  "/skins",
  "/how-to-install-deadlock-mods",
  "/deadlock-mods-not-working",
  "/compare/grimoire",
  "/deadlock-mod-manager-os-error-5",
  "/deadlock-mod-manager-os-error-740",
  "/deadlock-mod-manager-failed-to-save-mod-order",
  "/deadlock-mod-manager-failed-to-download",
  "/deadlock-fatal-error-unable-to-load-layout-file",
  "/randomizer",
  "/crosshair-generator",
  "/vpk-analyzer",
  "/kv-parser",
] as const;

const localizedPathSet = new Set<string>(LOCALIZED_PATHS);

const trimTrailingSlash = (path: string) =>
  path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;

export const isLocalizedPath = (path: string) =>
  localizedPathSet.has(trimTrailingSlash(path));

/** `/mods` in `ru` becomes `/ru/mods`; `/` becomes `/ru`. */
export const localizePath = (path: string, locale: Locale) => {
  const { prefix } = getLocaleConfig(locale);
  if (!prefix || !isLocalizedPath(path)) return path;
  const clean = trimTrailingSlash(path);
  return clean === "/" ? `/${prefix}` : `/${prefix}${clean}`;
};

/**
 * Splits a public pathname into its locale and the route path. Returns a null
 * locale when the path has no locale prefix, or when the prefix is followed by
 * a page that isn't translated (that URL is a 404, not an English page).
 */
export const delocalizePath = (pathname: string): DelocalizedPath => {
  const [, first = "", ...rest] = pathname.split("/");
  const match = LOCALES.find(
    (locale) => locale.prefix && locale.prefix === first.toLowerCase(),
  );
  if (!match) return { locale: null, path: pathname };
  const path = `/${rest.join("/")}`;
  if (!isLocalizedPath(path)) return { locale: null, path: pathname };
  return { locale: match.id, path };
};

/**
 * Picks the best supported locale from an Accept-Language header, honouring
 * q-values. Only exact language matches count: Ukrainian or Belarusian
 * browsers are not sent to the Russian site.
 */
export const matchAcceptLanguage = (header: string | null | undefined) => {
  if (!header) return null;
  const ranked = header
    .split(",")
    .map((part) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params
        .map((param) => param.trim())
        .find((param) => param.startsWith("q="));
      return { tag: tag.toLowerCase(), q: q ? Number(q.slice(2)) : 1 };
    })
    .filter((entry) => entry.tag && entry.q > 0)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    const [language] = tag.split("-");
    if (language === "pt") return "pt-BR" satisfies Locale;
    const match = LOCALES.find(
      (locale) => locale.id.toLowerCase() === language,
    );
    if (match) return match.id;
  }
  return null;
};
