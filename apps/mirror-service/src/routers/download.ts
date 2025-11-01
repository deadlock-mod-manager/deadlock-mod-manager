import { DatabaseErrorCode } from "@deadlock-mods/common";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { stream } from "hono/streaming";
import { z } from "zod";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { MirrorService } from "@/services/mirror";

const downloadRouter = new Hono();

downloadRouter.get(
  "/:modId/:fileId",
  zValidator(
    "param",
    z.object({
      modId: z.string(),
      fileId: z.string(),
    }),
  ),
  async (c) => {
    const { modId, fileId } = c.req.param();

    const result = await MirrorService.instance.mirrorFile(modId, fileId);

    if (result.isErr()) {
      const statusCode =
        result.error.code === DatabaseErrorCode.ENTITY_NOT_FOUND ? 404 : 500;

      logger
        .withMetadata({ modId, fileId, statusCode })
        .withError(result.error)
        .error("File download failed");

      const errorMessage =
        statusCode === 404 ? "Not found" : "Internal server error";
      return c.json({ error: errorMessage }, statusCode);
    }

    const { outputStream, size, file } = result.value;

    return stream(c, async (stream) => {
      c.header("Content-Type", "application/octet-stream");
      c.header("Content-Disposition", `attachment; filename="${file}"`);
      c.header("Content-Length", size.toString());
      c.header(
        "Cache-Control",
        `public, max-age=${env.CACHE_TTL_SECONDS}, s-maxage=${env.CACHE_TTL_SECONDS}, immutable`,
      );
      c.header("CDN-Cache-Control", `max-age=${env.CACHE_TTL_SECONDS}`);
      c.header("Vary", "Accept-Encoding");

      await stream.pipe(outputStream);
    });
  },
);

export default downloadRouter;
