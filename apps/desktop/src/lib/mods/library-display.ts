import type { LocalMod } from "@/types/mods";
import { isInstalledModWithVpks, isRepairableMod } from "./installed-helpers";

export type ModLibraryFilter = "all" | "enabled" | "needsRepair" | "disabled";

export function filterStableLibraryModsByStatus(
  mods: LocalMod[],
  filter: ModLibraryFilter,
): LocalMod[] {
  switch (filter) {
    case "enabled":
      return mods.filter(isInstalledModWithVpks);
    case "needsRepair":
      return mods.filter(isRepairableMod);
    case "disabled":
      return mods.filter(
        (mod) => !isInstalledModWithVpks(mod) && !isRepairableMod(mod),
      );
    case "all":
      return mods;
  }
}
