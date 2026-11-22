import { createInstance, type i18n, type ResourceKey } from "i18next";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "./locales";

/**
 * One JSON file per namespace and locale: src/locales/<file>/<namespace>.json.
 * English is the source Crowdin translates from; missing or empty keys in
 * other locales fall back to it.
 */
export const NAMESPACES = [
  "common",
  "home",
  "preview",
  "download",
  "tool-randomizer",
  "tool-crosshair",
  "tool-vpk",
  "tool-kv",
  "guide-mods",
  "guide-skins",
  "guide-install",
  "guide-not-working",
  "guide-grimoire",
  "v2",
  "error-os-5",
  "error-os-740",
  "error-mod-order",
  "error-download",
  "error-fatal",
] as const;

export type Namespace = (typeof NAMESPACES)[number];

const namespaceOf = (file: string) => file.match(/([^/]+)\.json$/)?.[1] ?? file;

const byNamespace = (files: Record<string, ResourceKey>) =>
  Object.fromEntries(
    Object.entries(files).map(([file, content]) => [
      namespaceOf(file),
      content,
    ]),
  );

/**
 * English is the fallback for every missing key, so it ships with the app.
 * Other languages load on demand, one chunk per language, so visitors only
 * download the language they read.
 */
const english = byNamespace(
  import.meta.glob<ResourceKey>("../../locales/en/*.json", {
    eager: true,
    import: "default",
  }),
);

const loaders = {
  ru: () => import("./bundles/ru-RU"),
  "pt-BR": () => import("./bundles/pt-BR"),
  pl: () => import("./bundles/pl-PL"),
  de: () => import("./bundles/de-DE"),
  fr: () => import("./bundles/fr-FR"),
  es: () => import("./bundles/es-ES"),
} satisfies Record<
  Exclude<Locale, "en">,
  () => Promise<{ default: Record<string, ResourceKey> }>
>;

/**
 * Makes a language's strings available before anything renders in it: the
 * root route awaits this on the server, and the router's hydrate step awaits
 * it in the browser so the first client render matches the server HTML.
 */
export const ensureLocale = async (instance: i18n, locale: Locale) => {
  if (locale === DEFAULT_LOCALE) return;
  if (instance.hasResourceBundle(locale, "common")) return;
  const { default: files } = await loaders[locale]();
  for (const [ns, content] of Object.entries(byNamespace(files))) {
    instance.addResourceBundle(locale, ns, content, true, true);
  }
};

/**
 * A fresh i18next instance per router, so concurrent server renders never
 * share a language. English is bundled, so init is synchronous; call
 * `ensureLocale` before rendering any other language.
 */
export const createI18n = (locale: Locale = DEFAULT_LOCALE): i18n => {
  const instance = createInstance();
  instance.init({
    resources: { [DEFAULT_LOCALE]: english },
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: LOCALES.map((entry) => entry.id),
    ns: NAMESPACES,
    defaultNS: "common",
    // Crowdin writes untranslated strings as "", which should fall back to English.
    returnEmptyString: false,
    interpolation: { escapeValue: false },
    initAsync: false,
    react: { useSuspense: false },
  });
  return instance;
};
