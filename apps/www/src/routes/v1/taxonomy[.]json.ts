import { buildTaxonomyDocument } from "@deadlock-mods/shared";
import { createFileRoute } from "@tanstack/react-router";

const body = `${JSON.stringify(buildTaxonomyDocument(), null, 2)}\n`;

/** Hero and content-type IDs for mod sources (RFC 002), read by other sites. */
export const Route = createFileRoute("/v1/taxonomy.json")({
  server: {
    handlers: {
      GET: () =>
        new Response(body, {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
            "Access-Control-Allow-Origin": "*",
          },
        }),
    },
  },
});
