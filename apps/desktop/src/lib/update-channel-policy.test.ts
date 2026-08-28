import { describe, expect, it } from "bun:test";
import en from "@/locales/en.json" with { type: "json" };
import tauriConfig from "../../src-tauri/tauri.conf.json" with { type: "json" };
import type { UpdateTarget } from "./tauri-commands";
import { buildStableRollbackUrl } from "./update-channel-policy";

const windowsWryTarget: UpdateTarget = {
  channel: "nightly",
  runtime: "wry",
  operatingSystem: "windows",
  architecture: "x86_64",
  installer: "nsis",
  installationStrategy: "native",
  manifestTarget: "windows-x86_64-nsis",
  flatpakAsset: null,
};

describe("update channel policy", () => {
  it("links manual rollback to the exact installed runtime and installer", () => {
    expect(buildStableRollbackUrl(windowsWryTarget)).toBe(
      "https://deadlockmods.app/download/windows?runtime=wry&installer=exe",
    );
    expect(
      buildStableRollbackUrl({
        ...windowsWryTarget,
        operatingSystem: "linux",
        runtime: "cef",
        installer: "deb",
        manifestTarget: "linux-x86_64-deb",
      }),
    ).toBe("https://deadlockmods.app/download/linux?runtime=cef&installer=deb");
  });

  it("documents testing trust, no downgrade, restart, and data preservation", () => {
    expect(en.settings.updateChannelNightly).toContain("Testing");
    expect(en.settings.updateChannelWindowsTrust).toContain("test-signed");
    expect(en.settings.updateChannelDescription).toContain(
      "does not downgrade",
    );
    expect(en.settings.updateChannelDescription).toContain("restart");
    expect(en.settings.updateChannelRollbackDescription).toContain(
      "application data is preserved",
    );
  });

  it("keeps Tauri signature verification configured", () => {
    expect(tauriConfig.plugins.updater.pubkey.length).toBeGreaterThan(40);
  });
});
