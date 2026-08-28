import { describe, expect, test } from "vitest";
import type { PlatformDownload } from "@/types/releases";
import {
  getDownloadDescription,
  getRuntimeName,
  getRuntimeStatus,
  isNightlyDownload,
  selectExactDownload,
  selectRecommendedDownload,
} from "./release-downloads";

const createDownload = (
  filename: string,
  installerType: PlatformDownload["installerType"],
  runtime: PlatformDownload["runtime"],
): PlatformDownload => ({
  platform: "linux",
  architecture: "x64",
  installerType,
  runtime,
  url: `https://example.test/${filename}`,
  filename,
  size: 10,
  downloadCount: 1,
});

describe("selectRecommendedDownload", () => {
  test("selects Wry even when CEF is listed first", () => {
    const downloads = [
      createDownload("deadlock-mod-manager-cef.flatpak", "flatpak", "cef"),
      createDownload("deadlock-mod-manager.flatpak", "flatpak", "wry"),
    ];

    expect(selectRecommendedDownload(downloads, "linux", "x64")?.runtime).toBe(
      "wry",
    );
  });

  test("prefers the verified Wry Flatpak for Linux", () => {
    const downloads = [
      createDownload("deadlock-mod-manager.deb", "deb", "wry"),
      createDownload("deadlock-mod-manager.flatpak", "flatpak", "wry"),
    ];

    expect(
      selectRecommendedDownload(downloads, "linux", "x64")?.installerType,
    ).toBe("flatpak");
  });

  test("returns no recommendation when only CEF is available", () => {
    const downloads = [
      createDownload("deadlock-mod-manager-cef.flatpak", "flatpak", "cef"),
    ];

    expect(selectRecommendedDownload(downloads, "linux", "x64")).toBeNull();
  });

  test("labels CEF packages and updater signatures explicitly", () => {
    const cefDeb = createDownload(
      "deadlock-mod-manager_1.2.3_amd64-cef.deb",
      "deb",
      "cef",
    );
    const signature = createDownload(
      "deadlock-mod-manager_1.2.3_amd64.deb.sig",
      "sig",
      "wry",
    );

    expect(getRuntimeName(cefDeb)).toBe("CEF");
    expect(getRuntimeStatus(cefDeb)).toBe("Experimental");
    expect(getDownloadDescription(cefDeb)).toBe(
      "Package for Debian and Ubuntu",
    );
    expect(getDownloadDescription(signature)).toBe(
      "Updater signature, not an installer",
    );
    expect(isNightlyDownload(cefDeb)).toBe(false);
    expect(
      isNightlyDownload(
        createDownload(
          "Deadlock.Mod.Manager_1.2.0-nightly.20260801.a633e8e_amd64-cef.deb",
          "deb",
          "cef",
        ),
      ),
    ).toBe(true);
  });
});

describe("selectExactDownload", () => {
  test("does not cross runtime or installer boundaries", () => {
    const wryDeb = createDownload("deadlock-mod-manager.deb", "deb", "wry");
    const cefDeb = createDownload("deadlock-mod-manager-cef.deb", "deb", "cef");
    const downloads = [wryDeb, cefDeb];

    expect(selectExactDownload(downloads, "linux", "x64", "cef", "deb")).toBe(
      cefDeb,
    );
    expect(
      selectExactDownload(downloads, "linux", "x64", "cef", "rpm"),
    ).toBeNull();
  });
});
