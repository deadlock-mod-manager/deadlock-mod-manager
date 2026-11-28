import { type BaseError, DatabaseErrorCode } from "@deadlock-mods/common";
import { Hono } from "hono";
import type { Result } from "neverthrow";
import type { Logger } from "@deadlock-mods/logging";

type FindDownload = (
  modId: string,
  fileId: string,
) => Promise<Result<{ url: string }, BaseError>>;

export const createDownloadRouter = (
  findDownload: FindDownload,
  logger: Logger,
) =>
  new Hono().get("/:modId/:fileId", async (c) => {
    const { modId, fileId } = c.req.param();
    const result = await findDownload(modId, fileId);

    c.header("Cache-Control", "no-store");

    if (result.isErr()) {
      if (result.error.code === DatabaseErrorCode.ENTITY_NOT_FOUND) {
        return c.json({ error: "Not found" }, 404);
      }

      logger
        .withMetadata({ modId, fileId })
        .withError(result.error)
        .error("Failed to look up legacy download");
      return c.json({ error: "Internal server error" }, 500);
    }

    const url = URL.parse(result.value.url);
    if (!url || (url.protocol !== "https:" && url.protocol !== "http:")) {
      logger
        .withMetadata({ modId, fileId })
        .error("Invalid upstream download URL");
      return c.json({ error: "Internal server error" }, 500);
    }

    return c.redirect(url.href, 307);
  });
