import { describe, expect, test } from "vitest";
import type { PlatformDownload } from "@/types/releases";
import {
  getDownloadDescription,
  getDownloadRuntime,
  getRuntimeName,
  getRuntimeStatus,
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

  test("prefers Wry Flatpak over native Linux packages", () => {
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

  test("labels CEF as experimental and Wry as recommended", () => {
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

    expect(getRuntimeName(cef)).toBe("CEF");
    expect(getRuntimeStatus(cef)).toBe("Experimental");
    expect(getRuntimeName(wry)).toBe("Wry");
    expect(getRuntimeStatus(wry)).toBe("Recommended");
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
    expect(getRuntimeStatus(cef)).toBe("Experimental");
    expect(selectRecommendedDownload([cef, wry], "linux", "x64")).toBe(wry);
    expect(selectRecommendedDownload([cef], "linux", "x64")).toBeNull();
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
    const msi: PlatformDownload = {
      ...createDownload("deadlock-mod-manager.msi", "msi", "wry"),
      platform: "windows",
    };
    const exe: PlatformDownload = {
      ...createDownload("deadlock-mod-manager.exe", "exe", "wry"),
      platform: "windows",
    };

    expect(selectRecommendedDownload([msi, exe], "windows", "x64")).toBe(exe);
  });

  test("returns no recommendation for an unknown platform", () => {
    expect(selectRecommendedDownload([], "unknown", "unknown")).toBeNull();
  });
});

describe("getDownloadDescription", () => {
  test("describes packages and updater signatures", () => {
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

    expect(getDownloadDescription(cefDeb)).toBe(
      "Package for Debian and Ubuntu",
    );
    expect(getDownloadDescription(signature)).toBe(
      "Updater signature, not an installer",
    );
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
