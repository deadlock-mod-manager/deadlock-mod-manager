import { createFileRoute } from "@tanstack/react-router";
import { absoluteUrl, INDEXABLE_PATHS } from "@/utils/seo";

const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${INDEXABLE_PATHS.map((path) => `  <url><loc>${absoluteUrl(path)}</loc></url>`).join("\n")}
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
