import { describe, expect, it } from "bun:test";
import { filterStableLibraryModsByStatus } from "./library-display";
import { type LocalMod, ModStatus } from "@/types/mods";

const mod = (
  remoteId: string,
  status: ModStatus,
  extra: Partial<LocalMod> = {},
): LocalMod =>
  ({
    id: remoteId,
    remoteId,
    name: remoteId,
    author: "Test Author",
    status,
    ...extra,
  }) as LocalMod;

const ids = (mods: LocalMod[]) => mods.map((item) => item.remoteId);

describe("filterStableLibraryModsByStatus", () => {
  it("preserves library order in the all view", () => {
    const mods = [
      mod("disabled-newer", ModStatus.Downloaded, {
        downloadedAt: new Date("2026-04-03"),
      }),
      mod("enabled-late-load-order", ModStatus.Installed, {
        installOrder: 99,
        installedVpks: ["late.vpk"],
      }),
      mod("enabled-early-load-order", ModStatus.Installed, {
        installOrder: 0,
        installedVpks: ["early.vpk"],
      }),
    ];

    expect(ids(filterStableLibraryModsByStatus(mods, "all"))).toEqual([
      "disabled-newer",
      "enabled-late-load-order",
      "enabled-early-load-order",
    ]);
  });

  it("preserves library-relative order in the enabled view instead of sorting by installOrder", () => {
    const mods = [
      mod("enabled-load-order-10", ModStatus.Installed, {
        installOrder: 10,
        installedVpks: ["ten.vpk"],
      }),
      mod("disabled", ModStatus.Downloaded),
      mod("enabled-load-order-1", ModStatus.Installed, {
        installOrder: 1,
        installedVpks: ["one.vpk"],
      }),
    ];

    expect(ids(filterStableLibraryModsByStatus(mods, "enabled"))).toEqual([
      "enabled-load-order-10",
      "enabled-load-order-1",
    ]);
  });

  it("filters disabled mods without including installed mods", () => {
    const mods = [
      mod("installed", ModStatus.Installed, {
        installedVpks: ["installed.vpk"],
      }),
      mod("downloaded", ModStatus.Downloaded),
      mod("failed-install", ModStatus.FailedToInstall),
    ];

    expect(ids(filterStableLibraryModsByStatus(mods, "disabled"))).toEqual([
      "downloaded",
      "failed-install",
    ]);
  });

  it("preserves caller-provided search result order instead of regrouping by status", () => {
    const searchResults = [
      mod("search-hit-disabled", ModStatus.Downloaded),
      mod("search-hit-enabled", ModStatus.Installed, {
        installOrder: 0,
        installedVpks: ["enabled.vpk"],
      }),
    ];

    expect(ids(filterStableLibraryModsByStatus(searchResults, "all"))).toEqual([
      "search-hit-disabled",
      "search-hit-enabled",
    ]);
  });
});
