import { describe, expect, it } from "bun:test";
import { type LocalMod, ModStatus } from "@/types/mods";
import { availableModUpdates, canCheckModUpdates } from "./mod-updates";

const modFor = (remoteId: string, status = ModStatus.Installed): LocalMod =>
  ({
    remoteId,
    remoteUrl: `https://gamebanana.com/mods/${remoteId}`,
    status,
  }) as LocalMod;
const updateFor = (mod: LocalMod, updatedAt = 200) => ({
  mod,
  updatedAt,
  downloads: [],
});

describe("mod update availability", () => {
  it("checks enabled and disabled downloads, excluding local and unfinished mods", () => {
    const mods = [
      modFor("enabled"),
      modFor("disabled", ModStatus.Downloaded),
      modFor("local-custom", ModStatus.Downloaded),
      modFor(""),
      ...Object.values(ModStatus)
        .filter(
          (status) =>
            status !== ModStatus.Installed && status !== ModStatus.Downloaded,
        )
        .map((status) => modFor(status, status)),
    ];
    expect(mods.filter(canCheckModUpdates).map((mod) => mod.remoteId)).toEqual([
      "enabled",
      "disabled",
    ]);
  });

  it("excludes local imports with remembered catalog IDs", () => {
    for (const status of [ModStatus.Installed, ModStatus.Downloaded]) {
      const local = {
        ...modFor("650634", status),
        remoteUrl: "local://manual",
      };
      expect(canCheckModUpdates(local)).toBe(false);
      expect(availableModUpdates([updateFor(local)], [local])).toEqual([]);
    }
    expect(canCheckModUpdates(modFor("650634"))).toBe(true);
  });

  it("includes disabled mods while honoring skipped update versions", () => {
    const enabled = modFor("enabled");
    const disabled = modFor("disabled", ModStatus.Downloaded);
    const skipped = {
      ...modFor("skipped", ModStatus.Downloaded),
      skippedUpdateAt: 200,
    };
    const updates = [enabled, disabled, skipped].map((mod) => updateFor(mod));
    expect(availableModUpdates(updates, [enabled, disabled, skipped])).toEqual(
      updates.slice(0, 2),
    );
    const newer = updateFor(skipped, 201);
    expect(availableModUpdates([newer], [skipped])).toEqual([newer]);
  });

  it("discards cached updates after a mod is removed or starts downloading", () => {
    const mod = modFor("target", ModStatus.Downloaded);
    const updates = [updateFor(mod)];
    expect(availableModUpdates(updates, [])).toEqual([]);
    expect(
      availableModUpdates(updates, [{ ...mod, status: ModStatus.Downloading }]),
    ).toEqual([]);
  });
});
