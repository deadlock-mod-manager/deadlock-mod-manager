import { SITE_URL, X_URL } from "@/lib/constants";
import {
  DEFAULT_LOCALE,
  getLocaleConfig,
  isLocalizedPath,
  LOCALES,
  type Locale,
  localizePath,
} from "@/lib/i18n/locales";
import { type OgCard, ogCardFor, ogCardImagePath } from "@/utils/og-cards";

export const SITE_NAME = "Deadlock Mod Manager";

const DEFAULT_DESCRIPTION =
  "Free, open-source mod manager for Valve's Deadlock. Browse GameBanana mods, install them in one click, and manage skins and sounds on Windows and Linux.";

const DEFAULT_OG_IMAGE = {
  url: `${SITE_URL}/og-image.png`,
  width: 1910,
  height: 1000,
  alt: "Deadlock Mod Manager logo with the tagline Download, Install & Manage Deadlock Mods",
};

/**
 * Indexable public pages, listed in the sitemap. Redirect routes (/docs,
 * /discord, /status), the per-platform download shortcuts, auth and
 * dashboard pages are left out on purpose.
 */
export const INDEXABLE_PATHS = [
  "/",
  "/download",
  "/mods",
  "/skins",
  "/how-to-install-deadlock-mods",
  "/deadlock-mods-not-working",
  "/compare/grimoire",
  "/v2",
  "/changelog",
  "/deadlock-mod-manager-os-error-5",
  "/deadlock-mod-manager-os-error-740",
  "/deadlock-mod-manager-failed-to-save-mod-order",
  "/deadlock-mod-manager-failed-to-download",
  "/deadlock-fatal-error-unable-to-load-layout-file",
  "/randomizer",
  "/crosshair-generator",
  "/vpk-analyzer",
  "/kv-parser",
  "/transparency",
  "/privacy",
  "/terms",
] as const;

export const absoluteUrl = (path: string) =>
  path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}`;

/** Absolute URL of a page in a given language. */
export const localizedUrl = (path: string, locale: Locale) =>
  absoluteUrl(localizePath(path, locale));

/**
 * hreflang alternates for a translated page: one per language plus
 * x-default, which points at English.
 */
export const alternateUrls = (path: string) =>
  isLocalizedPath(path)
    ? [
        ...LOCALES.map((locale) => ({
          hreflang: locale.hreflang,
          href: localizedUrl(path, locale.id),
        })),
        { hreflang: "x-default", href: localizedUrl(path, DEFAULT_LOCALE) },
      ]
    : [];

const cardImageMeta = (card: OgCard) => {
  const image = absoluteUrl(ogCardImagePath(card));
  const alt = `${card.title}. ${card.tagline}`;
  return [
    { property: "og:image", content: image },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:image:alt", content: alt },
    { name: "twitter:image", content: image },
    { name: "twitter:image:alt", content: alt },
  ];
};

const xHandle = `@${X_URL.split("/").pop()}`;

export interface SeoOptions {
  title: string;
  description?: string;
  /** Site-relative path, e.g. "/download". Drives the canonical link and og:url. */
  path?: string;
  keywords?: string;
  type?: "website" | "article";
  noindex?: boolean;
  /** Language the page renders in; drives the canonical URL and hreflang. */
  locale?: Locale;
}

/**
 * Per-page head tags. TanStack Router keeps the deepest route's meta when
 * names collide but does not dedupe links, so site-wide tags live in
 * `siteHead()` on the root route and only page tags (plus the canonical
 * link) come from here.
 */
export const seo = ({
  title,
  description = DEFAULT_DESCRIPTION,
  path,
  keywords,
  type = "website",
  noindex,
  locale = DEFAULT_LOCALE,
}: SeoOptions) => {
  const url = path ? localizedUrl(path, locale) : undefined;
  const card = path ? ogCardFor(path) : undefined;

  const meta = [
    { title },
    { name: "description", content: description },
    ...(keywords ? [{ name: "keywords", content: keywords }] : []),
    {
      name: "robots",
      content: noindex
        ? "noindex, follow"
        : "index, follow, max-image-preview:large",
    },
    ...(url ? [{ property: "og:url", content: url }] : []),
    { property: "og:type", content: type },
    { property: "og:locale", content: getLocaleConfig(locale).ogLocale },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    ...(card ? cardImageMeta(card) : []),
  ];

  const links =
    url && path && !noindex
      ? [
          { rel: "canonical", href: url },
          ...alternateUrls(path).map((alternate) => ({
            rel: "alternate",
            hrefLang: alternate.hreflang,
            href: alternate.href,
          })),
        ]
      : [];

  return { meta, links };
};

/** Site-wide head tags, used only by the root route. */
export const siteHead = () => ({
  meta: [
    { charSet: "utf-8" },
    { name: "viewport", content: "width=device-width, initial-scale=1" },
    { title: SITE_NAME },
    { name: "description", content: DEFAULT_DESCRIPTION },
    { name: "theme-color", content: "#d4af37" },
    { name: "color-scheme", content: "dark light" },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:locale", content: "en_US" },
    { property: "og:image", content: DEFAULT_OG_IMAGE.url },
    { property: "og:image:type", content: "image/png" },
    { property: "og:image:width", content: String(DEFAULT_OG_IMAGE.width) },
    { property: "og:image:height", content: String(DEFAULT_OG_IMAGE.height) },
    { property: "og:image:alt", content: DEFAULT_OG_IMAGE.alt },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:site", content: xHandle },
    { name: "twitter:creator", content: "@stormix_dev" },
    { name: "twitter:image", content: DEFAULT_OG_IMAGE.url },
    { name: "twitter:image:alt", content: DEFAULT_OG_IMAGE.alt },
    { name: "application-name", content: SITE_NAME },
    { name: "apple-mobile-web-app-title", content: SITE_NAME },
    { name: "apple-mobile-web-app-capable", content: "yes" },
    {
      name: "apple-mobile-web-app-status-bar-style",
      content: "black-translucent",
    },
    { name: "mobile-web-app-capable", content: "yes" },
    { name: "format-detection", content: "telephone=no" },
  ],
  links: [
    { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
    { rel: "apple-touch-icon", href: "/logo192.png" },
    { rel: "manifest", href: "/manifest.json" },
    { rel: "dns-prefetch", href: "https://api.deadlockmods.com" },
  ],
});
