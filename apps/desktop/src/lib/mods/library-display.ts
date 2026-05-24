import type { LocalMod } from "@/types/mods";
import { isInstalledModWithVpks, isRepairableMod } from "./installed-helpers";

export enum ModFilter {
  All = "all",
  Enabled = "enabled",
  NeedsRepair = "needsRepair",
  Disabled = "disabled",
}

export function filterLibraryModsByStatus(
  mods: LocalMod[],
  filter: ModFilter,
): LocalMod[] {
  switch (filter) {
    case ModFilter.Enabled:
      return mods.filter(isInstalledModWithVpks);
    case ModFilter.NeedsRepair:
      return mods.filter(isRepairableMod);
    case ModFilter.Disabled:
      return mods.filter(
        (mod) => !isInstalledModWithVpks(mod) && !isRepairableMod(mod),
      );
    case ModFilter.All:
      return mods;
  }
}
