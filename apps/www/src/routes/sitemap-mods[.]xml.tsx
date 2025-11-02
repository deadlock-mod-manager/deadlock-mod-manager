import type { ModDto } from "@deadlock-mods/shared";
import { createFileRoute } from "@tanstack/react-router";
import { serverClient } from "@/utils/orpc.server";

export const Route = createFileRoute("/sitemap-mods.xml")({
  server: {
    handlers: {
      GET: async () => {
        const mods = await serverClient.listModsV2();
        const xml = generateSitemapXML(mods);

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600, s-maxage=3600",
          },
        });
      },
    },
  },
});

function generateSitemapXML(mods: ModDto[]): string {
  const urls = mods
    .map((mod) => {
      const lastmod = mod.updatedAt
        ? new Date(mod.updatedAt).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];

      const encodedId = encodeURIComponent(mod.remoteId);

      return `  <url>
    <loc>https://deadlockmods.app/mod/${encodedId}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}
