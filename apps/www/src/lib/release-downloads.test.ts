import { describe, expect, test } from "vitest";
import type { PlatformDownload } from "@/types/releases";
import {
  getDownloadRuntime,
  getPlatformInstallers,
  getRuntimeName,
  getRuntimeStatus,
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
  test("selects the CEF Flatpak on Linux even when Wry is listed first", () => {
    const wryFlatpak = createDownload(
      "deadlock-mod-manager.flatpak",
      "flatpak",
      "wry",
    );
    const cefDeb = createDownload("deadlock-mod-manager-cef.deb", "deb", "cef");
    const cefFlatpak = createDownload(
      "deadlock-mod-manager-cef.flatpak",
      "flatpak",
      "cef",
    );

    expect(
      selectRecommendedDownload(
        [wryFlatpak, cefDeb, cefFlatpak],
        "linux",
        "x64",
      ),
    ).toBe(cefFlatpak);
  });

  test("falls back to Wry on Linux when a release has no CEF builds", () => {
    const downloads = [
      createDownload("deadlock-mod-manager.deb", "deb", "wry"),
      createDownload("deadlock-mod-manager.flatpak", "flatpak", "wry"),
    ];

    expect(
      selectRecommendedDownload(downloads, "linux", "x64")?.installerType,
    ).toBe("flatpak");
  });

  test("never recommends CEF on Windows", () => {
    const cef: PlatformDownload = {
      ...createDownload("deadlock-mod-manager-cef-setup.exe", "exe", "cef"),
      platform: "windows",
    };

    expect(selectRecommendedDownload([cef], "windows", "x64")).toBeNull();
    expect(getPlatformInstallers([cef], "windows")).toEqual({
      primary: [],
      alternative: [cef],
    });
  });

  test("lists Linux CEF installers first and Wry as the alternative", () => {
    const wry = createDownload(
      "deadlock-mod-manager.flatpak",
      "flatpak",
      "wry",
    );
    const cef = createDownload(
      "deadlock-mod-manager-cef.flatpak",
      "flatpak",
      "cef",
    );

    expect(getPlatformInstallers([wry, cef], "linux")).toEqual({
      primary: [cef],
      alternative: [wry],
    });
  });

  test("labels the platform's preferred runtime as recommended", () => {
    const cef = createDownload(
      "deadlock-mod-manager-cef.flatpak",
      "flatpak",
      "cef",
    );
    const wry = createDownload(
      "deadlock-mod-manager.flatpak",
      "flatpak",
      "wry",
    );

    const windowsCef: PlatformDownload = { ...cef, platform: "windows" };

    expect(getRuntimeName(cef)).toBe("CEF");
    expect(getRuntimeStatus(cef)).toBe("Recommended");
    expect(getRuntimeName(wry)).toBe("Wry");
    expect(getRuntimeStatus(wry)).toBe("Alternative");
    expect(getRuntimeStatus(windowsCef)).toBe("Alternative");
  });

  test("recognizes CEF filenames when runtime metadata is absent", () => {
    const cef = createDownload(
      "DEV.STORMIX.DEADLOCK-MOD-MANAGER.CEF.FLATPAK",
      "flatpak",
      undefined,
    );
    const cefDeb = createDownload(
      "Deadlock.Mod.Manager_1.2.3_amd64-cef.deb",
      "deb",
      undefined,
    );
    const wry = createDownload(
      "deadlock-mod-manager.flatpak",
      "flatpak",
      undefined,
    );

    expect(getDownloadRuntime(cef)).toBe("cef");
    expect(getDownloadRuntime(cefDeb)).toBe("cef");
    expect(selectRecommendedDownload([wry, cef], "linux", "x64")).toBe(cef);
  });

  test("does not recommend updater signatures", () => {
    const signature = createDownload(
      "deadlock-mod-manager.deb.sig",
      "sig",
      "wry",
    );
    const deb = createDownload("deadlock-mod-manager.deb", "deb", "wry");

    expect(selectRecommendedDownload([signature, deb], "linux", "x64")).toBe(
      deb,
    );
    expect(selectRecommendedDownload([signature], "linux", "x64")).toBeNull();
  });

  test("matches architecture before installer preference", () => {
    const flatpak = createDownload(
      "deadlock-mod-manager.flatpak",
      "flatpak",
      "wry",
    );
    const armDeb: PlatformDownload = {
      ...createDownload("deadlock-mod-manager_arm64.deb", "deb", "wry"),
      architecture: "arm64",
    };

    expect(selectRecommendedDownload([flatpak, armDeb], "linux", "arm64")).toBe(
      armDeb,
    );
  });

  test("keeps the Windows exe preference", () => {
    const portable: PlatformDownload = {
      ...createDownload("deadlock-mod-manager-portable.exe", "portable", "wry"),
      platform: "windows",
    };
    const msi: PlatformDownload = {
      ...createDownload("deadlock-mod-manager.msi", "msi", "wry"),
      platform: "windows",
    };
    const exe: PlatformDownload = {
      ...createDownload("deadlock-mod-manager.exe", "exe", "wry"),
      platform: "windows",
    };

    expect(
      selectRecommendedDownload([portable, msi, exe], "windows", "x64"),
    ).toBe(exe);
  });

  test("returns no recommendation for an unknown platform", () => {
    expect(selectRecommendedDownload([], "unknown", "unknown")).toBeNull();
  });
});
