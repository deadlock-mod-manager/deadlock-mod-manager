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
}

export const seo = ({
  title,
  description,
  keywords,
  image,
  url,
  type = "website",
  author,
  twitterCreator = "@stormix_dev",
  twitterSite = "@stormix_dev",
  canonical,
  themeColor = "#d4af37",
  lang = "en",
}: SeoOptions) => {
  const tags = [
    { charSet: "utf-8" },
    {
      name: "viewport",
      content: "width=device-width, initial-scale=1",
    },
    { title },
    ...(description ? [{ name: "description", content: description }] : []),
    ...(keywords ? [{ name: "keywords", content: keywords }] : []),
    ...(author ? [{ name: "author", content: author }] : []),
    { name: "robots", content: "index, follow" },
    { name: "language", content: lang },
    ...(themeColor ? [{ name: "theme-color", content: themeColor }] : []),
    { name: "color-scheme", content: "dark light" },
    ...(url ? [{ property: "og:url", content: url }] : []),
    { property: "og:type", content: type },
    { property: "og:title", content: title },
    ...(description
      ? [{ property: "og:description", content: description }]
      : []),
    ...(image
      ? [
          { property: "og:image", content: image },
          { property: "og:image:alt", content: title },
        ]
      : []),
    { name: "og:site_name", content: "Deadlock Mod Manager" },
    { name: "og:locale", content: "en_US" },
    ...(image
      ? [
          { property: "twitter:card", content: "summary_large_image" },
          { property: "twitter:image", content: image },
          { property: "twitter:image:alt", content: title },
        ]
      : []),
    { property: "twitter:title", content: title },
    ...(description
      ? [{ property: "twitter:description", content: description }]
      : []),
    ...(twitterCreator
      ? [{ property: "twitter:creator", content: twitterCreator }]
      : []),
    ...(twitterSite
      ? [{ property: "twitter:site", content: twitterSite }]
      : []),
    ...(url ? [{ property: "twitter:url", content: url }] : []),
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
    ...(canonical ? [{ rel: "canonical", href: canonical }] : []),
    { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
    {
      rel: "apple-touch-icon",
      sizes: "180x180",
      href: "/apple-touch-icon.png",
    },
    { rel: "mask-icon", href: "/safari-pinned-tab.svg", color: themeColor },
    {
      rel: "preconnect",
      href: "https://rsms.me",
    },
    { rel: "dns-prefetch", href: "https://api.deadlockmods.com" },
    { rel: "stylesheet", href: "https://rsms.me/inter/inter.css" },
  ];

  return { meta: tags, links };
};
