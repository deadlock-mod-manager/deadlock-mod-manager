import { describe, expect, it } from "bun:test";
import { ProviderError } from "@deadlock-mods/common";
import { assertGameBananaResponseOk } from "./response";

describe("GameBanana HTTP error handling", () => {
  for (const [status, body] of [
    [403, "<html>Access denied</html>"],
    [503, "Service unavailable"],
    [429, '{"error":"rate limited"}'],
    [502, ""],
  ] satisfies [number, string][]) {
    it(`preserves HTTP ${status} without reading the response twice`, async () => {
      const response = new Response(body, { status });
      await expect(assertGameBananaResponseOk(response)).rejects.toThrow(
        new ProviderError(`HTTP ${status}: ${body}`),
      );
      expect(response.bodyUsed).toBe(true);
    });
  }

  it("leaves successful response bodies available to the caller", async () => {
    const response = Response.json({ files: [] });
    await assertGameBananaResponseOk(response);
    expect(response.bodyUsed).toBe(false);
    expect(await response.json()).toEqual({ files: [] });
  });

  it("bounds upstream error text included in reports", async () => {
    const response = new Response("x".repeat(4096), { status: 503 });
    await expect(assertGameBananaResponseOk(response)).rejects.toThrow(
      new ProviderError(`HTTP 503: ${"x".repeat(2048)}`),
    );
  });
});
