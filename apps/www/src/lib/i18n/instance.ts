import { createInstance, type i18n, type ResourceKey } from "i18next";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "./locales";

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

export const ensureLocale = async (instance: i18n, locale: Locale) => {
  if (locale === DEFAULT_LOCALE) return;
  if (instance.hasResourceBundle(locale, "common")) return;
  const { default: files } = await loaders[locale]();
  for (const [ns, content] of Object.entries(byNamespace(files))) {
    instance.addResourceBundle(locale, ns, content, true, true);
  }
};

export const createI18n = (locale: Locale = DEFAULT_LOCALE): i18n => {
  const instance = createInstance();
  instance.init({
    resources: { [DEFAULT_LOCALE]: english },
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: LOCALES.map((entry) => entry.id),
    ns: NAMESPACES,
    defaultNS: "common",
    returnEmptyString: false,
    interpolation: { escapeValue: false },
    initAsync: false,
    react: { useSuspense: false },
  });
  return instance;
};
