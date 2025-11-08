export interface SeoOptions {
  title: string;
  description?: string;
  keywords?: string;
  image?: string;
  url?: string;
  type?: "website" | "article";
  author?: string;
  twitterCreator?: string;
  twitterSite?: string;
  canonical?: string;
  themeColor?: string;
  lang?: string;
  noindex?: boolean;
}

export const BASE_SEO: Partial<SeoOptions> = {
  description:
    "The ultimate mod manager for Valve's Deadlock game. Browse, download, and manage mods from GameBanana with automatic installation detection. Cross-platform support for Windows, macOS, and Linux.",
  keywords:
    "deadlock mod manager, deadlock mods, valve deadlock, game mod manager, gamebanana mods, deadlock modding, tauri app, deadlock tools, valve games, mods installer, deadlock community",
  image: "/og-image.png",
  url: "https://deadlockmods.app/",
  canonical: "https://deadlockmods.app/",
  type: "website",
  twitterCreator: "@stormix_dev",
  twitterSite: "@stormix_dev",
  themeColor: "#d4af37",
  lang: "en",
};

export const seo = ({
  title,
  description,
  keywords,
  image,
  url,
  type,
  author,
  twitterCreator,
  twitterSite,
  canonical,
  themeColor,
  lang,
  noindex,
}: SeoOptions) => {
  const merged = {
    ...BASE_SEO,
    title,
    ...(description !== undefined && { description }),
    ...(keywords !== undefined && { keywords }),
    ...(image !== undefined && { image }),
    ...(url !== undefined && { url }),
    ...(type !== undefined && { type }),
    ...(author !== undefined && { author }),
    ...(twitterCreator !== undefined && { twitterCreator }),
    ...(twitterSite !== undefined && { twitterSite }),
    ...(canonical !== undefined && { canonical }),
    ...(themeColor !== undefined && { themeColor }),
    ...(lang !== undefined && { lang }),
  };
  const tags = [
    { charSet: "utf-8" },
    {
      name: "viewport",
      content: "width=device-width, initial-scale=1",
    },
    { title: merged.title },
    ...(merged.description
      ? [{ name: "description", content: merged.description }]
      : []),
    ...(merged.keywords
      ? [{ name: "keywords", content: merged.keywords }]
      : []),
    ...(merged.author ? [{ name: "author", content: merged.author }] : []),
    {
      name: "robots",
      content: noindex ? "noindex, nofollow" : "index, follow",
    },
    { name: "language", content: merged.lang },
    ...(merged.themeColor
      ? [{ name: "theme-color", content: merged.themeColor }]
      : []),
    { name: "color-scheme", content: "dark light" },
    ...(merged.url ? [{ property: "og:url", content: merged.url }] : []),
    { property: "og:type", content: merged.type },
    { property: "og:title", content: merged.title },
    ...(merged.description
      ? [{ property: "og:description", content: merged.description }]
      : []),
    ...(merged.image
      ? [
          { property: "og:image", content: merged.image },
          { property: "og:image:alt", content: merged.title },
        ]
      : []),
    { name: "og:site_name", content: "Deadlock Mod Manager" },
    { name: "og:locale", content: "en_US" },
    {
      name: "twitter:card",
      content: merged.image ? "summary_large_image" : "summary",
    },
    { name: "twitter:title", content: merged.title },
    ...(merged.description
      ? [{ name: "twitter:description", content: merged.description }]
      : []),
    ...(merged.image
      ? [
          { name: "twitter:image", content: merged.image },
          { name: "twitter:image:alt", content: merged.title },
        ]
      : []),
    ...(merged.twitterCreator
      ? [{ name: "twitter:creator", content: merged.twitterCreator }]
      : []),
    ...(merged.twitterSite
      ? [{ name: "twitter:site", content: merged.twitterSite }]
      : []),
    ...(merged.url ? [{ name: "twitter:url", content: merged.url }] : []),
    { name: "application-name", content: "Deadlock Mod Manager" },
    { name: "apple-mobile-web-app-title", content: "Deadlock Mod Manager" },
    { name: "apple-mobile-web-app-capable", content: "yes" },
    {
      name: "apple-mobile-web-app-status-bar-style",
      content: "black-translucent",
    },
    { name: "format-detection", content: "telephone=no" },
    { name: "mobile-web-app-capable", content: "yes" },
  ];

  const links = [
    ...(merged.canonical ? [{ rel: "canonical", href: merged.canonical }] : []),
    { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
    {
      rel: "apple-touch-icon",
      sizes: "180x180",
      href: "/apple-touch-icon.png",
    },
    {
      rel: "mask-icon",
      href: "/safari-pinned-tab.svg",
      color: merged.themeColor,
    },
    {
      rel: "preconnect",
      href: "https://rsms.me",
    },
    { rel: "dns-prefetch", href: "https://api.deadlockmods.com" },
    { rel: "stylesheet", href: "https://rsms.me/inter/inter.css" },
  ];

  return { meta: tags, links };
};
