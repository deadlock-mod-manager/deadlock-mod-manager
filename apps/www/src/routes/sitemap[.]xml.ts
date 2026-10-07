import { createFileRoute } from "@tanstack/react-router";
import { LOCALES } from "@/lib/i18n/locales";
import {
  absoluteUrl,
  alternateUrls,
  INDEXABLE_PATHS,
  localizedUrl,
} from "@/utils/seo";

/**
 * Every translated page is listed once per language, and each entry names all
 * its language versions so search engines can pair them up.
 */
const entry = (loc: string, alternates: ReturnType<typeof alternateUrls>) =>
  [
    `  <url>`,
    `    <loc>${loc}</loc>`,
    ...alternates.map(
      (alternate) =>
        `    <xhtml:link rel="alternate" hreflang="${alternate.hreflang}" href="${alternate.href}"/>`,
    ),
    `  </url>`,
  ].join("\n");

const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${INDEXABLE_PATHS.flatMap((path) => {
  const alternates = alternateUrls(path);
  if (alternates.length === 0) return [entry(absoluteUrl(path), [])];
  return LOCALES.map((locale) =>
    entry(localizedUrl(path, locale.id), alternates),
  );
}).join("\n")}
</urlset>
`;

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: () =>
        new Response(body, {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        }),
    },
  },
});
