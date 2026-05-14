import type { LocalMod } from "@/types/mods";
import { isInstalledModWithVpks } from "./installed-helpers";

export type ModLibraryFilter = "all" | "enabled" | "disabled";

export function filterStableLibraryModsByStatus(
  mods: LocalMod[],
  filter: ModLibraryFilter,
): LocalMod[] {
  switch (filter) {
    case "enabled":
      return mods.filter(isInstalledModWithVpks);
    case "disabled":
      return mods.filter((mod) => !isInstalledModWithVpks(mod));
    case "all":
      return mods;
  }
}
