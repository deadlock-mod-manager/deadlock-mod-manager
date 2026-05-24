import type { LocalMod } from "@/types/mods";
import { isInstalledModWithFiles } from "./installed-helpers";

export enum ModFilter {
  All = "all",
  Enabled = "enabled",
  Disabled = "disabled",
}

export function filterStableLibraryModsByStatus(
  mods: LocalMod[],
  filter: ModFilter,
): LocalMod[] {
  switch (filter) {
    case ModFilter.Enabled:
      return mods.filter(isInstalledModWithFiles);
    case ModFilter.Disabled:
      return mods.filter((mod) => !isInstalledModWithFiles(mod));
    case ModFilter.All:
      return mods;
  }
}
