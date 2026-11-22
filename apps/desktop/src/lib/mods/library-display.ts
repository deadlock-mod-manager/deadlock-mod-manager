import type { LocalMod } from "@/types/mods";
import { resolveLocalModHero } from "./hero-resolution";
import { isInstalledModWithVpks } from "./installed-helpers";

export enum ModFilter {
  All = "all",
  Enabled = "enabled",
  Disabled = "disabled",
}

export enum LibrarySortType {
  InstallOrder = "install order",
  Hero = "hero",
  Name = "name",
  RecentlyAdded = "recently added",
}

export function filterLibraryModsByStatus(
  mods: LocalMod[],
  filter: ModFilter,
): LocalMod[] {
  switch (filter) {
    case ModFilter.Enabled:
      return mods.filter(isInstalledModWithVpks);
    case ModFilter.Disabled:
      return mods.filter((mod) => !isInstalledModWithVpks(mod));
    case ModFilter.All:
      return mods;
  }
}

const getDownloadedTime = (mod: LocalMod) =>
  mod.downloadedAt ? new Date(mod.downloadedAt).getTime() : 0;

const compareByName = (a: LocalMod, b: LocalMod) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

const compareByInstallOrder = (a: LocalMod, b: LocalMod) => {
  const orderA = a.installOrder ?? Number.MAX_SAFE_INTEGER;
  const orderB = b.installOrder ?? Number.MAX_SAFE_INTEGER;
  if (orderA !== orderB) return orderA - orderB;
  return getDownloadedTime(a) - getDownloadedTime(b);
};

export function sortLibraryMods(
  mods: LocalMod[],
  sortType: LibrarySortType,
): LocalMod[] {
  switch (sortType) {
    case LibrarySortType.InstallOrder:
      return [...mods].sort(compareByInstallOrder);
    case LibrarySortType.Name:
      return [...mods].sort(compareByName);
    case LibrarySortType.RecentlyAdded:
      return [...mods].sort(
        (a, b) => getDownloadedTime(b) - getDownloadedTime(a),
      );
    case LibrarySortType.Hero: {
      const heroes = new Map(
        mods.map((mod) => [mod, resolveLocalModHero(mod).hero]),
      );
      // Mods without a detected hero go last, then ties fall back to name.
      return [...mods].sort((a, b) => {
        const heroA = heroes.get(a);
        const heroB = heroes.get(b);
        if (heroA && heroB && heroA !== heroB) {
          return heroA.localeCompare(heroB);
        }
        if (heroA && !heroB) return -1;
        if (!heroA && heroB) return 1;
        return compareByName(a, b);
      });
    }
  }
}

export function formatModList(
  mods: LocalMod[],
  includeDisabled: boolean,
  disabledLabel: string,
): string {
  const listed = includeDisabled ? mods : mods.filter(isInstalledModWithVpks);
  return sortLibraryMods(listed, LibrarySortType.InstallOrder)
    .map((mod) => {
      const disabled =
        includeDisabled && !isInstalledModWithVpks(mod)
          ? ` (${disabledLabel})`
          : "";
      const url = mod.remoteUrl.startsWith("local://")
        ? ""
        : ` - ${mod.remoteUrl}`;
      return `${mod.name}${disabled}${url}`;
    })
    .join("\n");
}
