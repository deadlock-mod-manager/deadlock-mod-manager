import { describe, expect, test } from "bun:test";
import { EntityNotFoundError } from "@deadlock-mods/common";
import { createMockLogger } from "@deadlock-mods/logging";
import { err, ok } from "neverthrow";
import { createDownloadRouter } from "./download";

const logger = createMockLogger();
const path = "/mod_123/mod_download_456";
const upstream = "https://gamebanana.com/dl/789?source=download";

describe("legacy mirror downloads", () => {
  test.each(["GET", "HEAD"])(
    "redirects %s to the stored archive URL",
    async (method) => {
      const app = createDownloadRouter(
        async (modId, fileId) =>
          modId === "mod_123" && fileId === "mod_download_456"
            ? ok({ url: upstream })
            : err(new EntityNotFoundError("File not found")),
        logger,
      );

      const response = await app.request(path, { method });

      expect(response.status).toBe(307);
      expect(response.headers.get("Location")).toBe(upstream);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    },
  );

  test("returns 404 for a missing mod and file pair", async () => {
    const app = createDownloadRouter(
      async () => err(new EntityNotFoundError("File not found")),
      logger,
    );

    const response = await app.request(path);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
  });

  test("does not redirect to a non-HTTP storage URL", async () => {
    const app = createDownloadRouter(
      async () => ok({ url: "file:///archive.zip" }),
      logger,
    );

    const response = await app.request(path);

    expect(response.status).toBe(500);
    expect(response.headers.get("Location")).toBeNull();
  });
});
