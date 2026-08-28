import { describe, expect, test } from "bun:test";
import type { GitHubAsset, GitHubRelease } from "../types/github-releases";
import {
  parseReleaseAsset,
  transformReleaseAssets,
} from "./release-asset-policy";

const createAsset = (name: string): GitHubAsset => ({
  name,
  download_count: 1,
  browser_download_url: `https://example.test/${name}`,
  size: 10,
  content_type: "application/octet-stream",
});

const createRelease = (assets: GitHubAsset[]): GitHubRelease => ({
  tag_name: "v1.2.3",
  name: "1.2.3",
  body: "Release notes",
  published_at: "2026-08-27T00:00:00Z",
  assets,
  draft: false,
  prerelease: false,
});

describe("GitHubReleasesService runtime policy", () => {
  test("distinguishes Wry and CEF assets", () => {
    expect(parseReleaseAsset("deadlock-mod-manager.flatpak")?.runtime).toBe(
      "wry",
    );
    expect(parseReleaseAsset("deadlock-mod-manager-cef.flatpak")?.runtime).toBe(
      "cef",
    );
    expect(
      parseReleaseAsset("deadlock-mod-manager_1.2.3_amd64-cef.deb")?.runtime,
    ).toBe("cef");
  });

  test("withholds CEF assets without an exact verification attestation", () => {
    const release = createRelease([
      createAsset("deadlock-mod-manager-cef.flatpak"),
      createAsset("deadlock-mod-manager-cef-setup.exe"),
    ]);

    expect(transformReleaseAssets(release)).toEqual([]);
  });

  test("publishes an attested CEF target after the Wry default", () => {
    const release = createRelease([
      createAsset("deadlock-mod-manager-cef.flatpak"),
      createAsset("deadlock-mod-manager.flatpak"),
      createAsset(
        "deadlock-mod-manager-cef-linux-x86_64-flatpak.verified.json",
      ),
    ]);

    const downloads = transformReleaseAssets(release);

    expect(downloads.map((download) => download.runtime)).toEqual([
      "wry",
      "cef",
    ]);
    expect(downloads[1]?.installerType).toBe("flatpak");
  });
});
