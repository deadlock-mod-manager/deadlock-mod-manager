import { OpenAPIGenerator } from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { Hono } from "hono";
import { version } from "@/version";
import { appRouter } from "..";

const docsRouter = new Hono();

docsRouter.get("/openapi.json", async (c) => {
  const generator = new OpenAPIGenerator({
    schemaConverters: [new ZodToJsonSchemaConverter()],
  });

  const spec = await generator.generate(appRouter, {
    info: {
      title: "Deadlock Mods API",
      version,
      description: "API powering the Deadlock Mod Manager",
    },
    servers: [
      {
        url: "https://api.deadlock-mods.com/api",
        description: "Production server",
      },
      {
        url: "http://localhost:9000/api",
        description: "Development server",
      },
    ],
  });

  return c.json(spec);
});

export default docsRouter;
