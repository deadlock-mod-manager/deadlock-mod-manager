import { describe, expect, it } from "bun:test";
import {
  isInstalledModWithFiles,
  isInstalledModWithVpks,
} from "@/lib/mods/installed-helpers";
import { ModStatus } from "@/types/mods";

describe("installed mod helpers", () => {
  const configOnlyMod = {
    status: ModStatus.Installed,
    installedConfigFiles: ["cfg/autoexec.cfg"],
  };

  it("treats config-only installed mods as installed with files", () => {
    expect(isInstalledModWithFiles(configOnlyMod)).toBe(true);
  });

  it("does not treat config-only mods as installed with VPKs", () => {
    expect(isInstalledModWithVpks(configOnlyMod)).toBe(false);
  });
});
