import { SITE_URL, X_URL } from "@/lib/constants";

export const SITE_NAME = "Deadlock Mod Manager";

export const DEFAULT_DESCRIPTION =
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

const xHandle = `@${X_URL.split("/").pop()}`;

export interface SeoOptions {
  title: string;
  description?: string;
  /** Site-relative path, e.g. "/download". Drives the canonical link and og:url. */
  path?: string;
  keywords?: string;
  type?: "website" | "article";
  noindex?: boolean;
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
}: SeoOptions) => {
  const url = path ? absoluteUrl(path) : undefined;

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
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  ];

  const links = url && !noindex ? [{ rel: "canonical", href: url }] : [];

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
