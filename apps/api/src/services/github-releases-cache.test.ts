import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { ProviderError } from "@deadlock-mods/common";
import { createMockLogger } from "@deadlock-mods/logging";

mock.module("../lib/logger", () => ({ logger: createMockLogger() }));

const { GitHubReleasesService } = await import("./github-releases");

const now = Date.parse("2026-10-19T12:00:00Z");
const expired = now + 16 * 60 * 1000;
const releaseResponse = (version = "1.2.3") =>
  Response.json([
    {
      tag_name: `v${version}`,
      name: version,
      body: "Release notes",
      published_at: "2026-10-18T00:00:00Z",
      assets: [],
      draft: false,
      prerelease: false,
    },
  ]);

afterEach(() => mock.restore());

describe("GitHub release request caching", () => {
  it("shares a single upstream request among concurrent callers", async () => {
    const pending = Promise.withResolvers<Response>();
    const fetch = spyOn(globalThis, "fetch").mockReturnValue(pending.promise);
    const service = new GitHubReleasesService();
    const requests = [
      service.fetchReleases(),
      service.fetchReleases(),
      service.fetchReleases(),
    ];
    pending.resolve(releaseResponse());
    const results = await Promise.all(requests);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(results.map((result) => result.latest.version)).toEqual([
      "1.2.3",
      "1.2.3",
      "1.2.3",
    ]);
    expect((await service.fetchReleases()).latest.version).toBe("1.2.3");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("serves stale releases until the primary rate limit resets", async () => {
    const clock = spyOn(Date, "now").mockReturnValue(now);
    const fetch = spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(releaseResponse())
      .mockResolvedValueOnce(
        new Response(null, {
          status: 403,
          headers: { "x-ratelimit-reset": String((expired + 120_000) / 1000) },
        }),
      )
      .mockResolvedValueOnce(releaseResponse("1.2.4"));
    const service = new GitHubReleasesService();
    await service.fetchReleases();
    clock.mockReturnValue(expired);
    expect((await service.fetchReleases()).latest.version).toBe("1.2.3");
    expect((await service.fetchReleases()).latest.version).toBe("1.2.3");
    expect(fetch).toHaveBeenCalledTimes(2);
    clock.mockReturnValue(expired + 120_001);
    expect((await service.fetchReleases()).latest.version).toBe("1.2.4");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it.each([
    { retryAfter: "120", duration: 120_000 },
    { retryAfter: new Date(now + 120_000).toUTCString(), duration: 120_000 },
    { retryAfter: "invalid", duration: 60_000 },
  ])(
    "backs off cold-cache requests with Retry-After=$retryAfter",
    async ({ retryAfter, duration }) => {
      const clock = spyOn(Date, "now").mockReturnValue(now);
      const fetch = spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          new Response(null, {
            status: 429,
            headers: { "retry-after": retryAfter },
          }),
        )
        .mockResolvedValueOnce(releaseResponse());
      const service = new GitHubReleasesService();
      await expect(service.fetchReleases()).rejects.toBeInstanceOf(
        ProviderError,
      );
      clock.mockReturnValue(now + duration - 1);
      await expect(service.fetchReleases()).rejects.toBeInstanceOf(
        ProviderError,
      );
      expect(fetch).toHaveBeenCalledTimes(1);
      clock.mockReturnValue(now + duration + 1);
      expect((await service.fetchReleases()).latest.version).toBe("1.2.3");
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );

  it("does not let clearing cached data bypass an active rate limit", async () => {
    spyOn(Date, "now").mockReturnValue(now);
    const fetch = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 403 }),
    );
    const service = new GitHubReleasesService();
    await expect(service.fetchReleases()).rejects.toBeInstanceOf(ProviderError);
    service.clearCache();
    await expect(service.fetchReleases()).rejects.toBeInstanceOf(ProviderError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("releases the pending request after failure so a later request can recover", async () => {
    const fetch = spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new TypeError("network offline"))
      .mockResolvedValueOnce(releaseResponse());
    const service = new GitHubReleasesService();
    await expect(service.fetchReleases()).rejects.toThrow("network offline");
    expect((await service.fetchReleases()).latest.version).toBe("1.2.3");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
