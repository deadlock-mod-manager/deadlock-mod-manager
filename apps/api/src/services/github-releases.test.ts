import { afterEach, expect, mock, spyOn, test } from "bun:test";
import type { GitHubRelease } from "../types/github-releases";

const logger = {
  child: () => logger,
  withContext: () => logger,
  withMetadata: () => logger,
  withError: () => logger,
  info: () => {},
  debug: () => {},
  warn: () => {},
  error: () => {},
};
mock.module("../lib/logger", () => ({ logger }));
const { GitHubReleasesService } = await import("./github-releases");
const service = GitHubReleasesService.getInstance();

afterEach(() => {
  mock.restore();
  service.clearCache();
});

test("installer downloads exclude the standalone executable regardless of asset order", async () => {
  const filenames = [
    "Deadlock Mod Manager_1.0.0_x64-portable.exe",
    "Deadlock Mod Manager_1.0.0_x64-portable.exe.sig",
    "DMM-setup.exe",
    "DMM-setup.exe.sig",
    "DMM.msi",
  ];
  const release: GitHubRelease = {
    tag_name: "v1.0.0",
    name: "DMM 1.0.0",
    body: "Release notes",
    published_at: "2026-10-03T00:00:00Z",
    draft: false,
    prerelease: false,
    assets: filenames.map((name) => ({
      name,
      browser_download_url: `https://example.com/${name}`,
      download_count: 1,
      size: 100,
      content_type: "application/octet-stream",
    })),
  };
  spyOn(globalThis, "fetch").mockResolvedValue(Response.json([release]));
  const releases = await service.fetchReleases();
  expect(
    releases.latest.downloads.map((download) => download.filename),
  ).toEqual(["DMM-setup.exe", "DMM-setup.exe.sig", "DMM.msi"]);
  expect(releases.allVersions[0]?.downloads).toEqual(releases.latest.downloads);
});
