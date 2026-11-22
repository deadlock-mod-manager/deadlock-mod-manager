import { previousInstallSelection } from "@/lib/mods/mod-variants";
import { canRandomizeMod, isRandomizedPool } from "@/lib/mods/skin-randomizer";
import { type LocalMod, ModStatus } from "@/types/mods";
import type { ModGroup, VpkManifest } from "@/types/profiles";

type GroupRandomizableMod = Pick<
  LocalMod,
  | "remoteId"
  | "status"
  | "usesCriticalPaths"
  | "installedFileTree"
  | "installedVpks"
  | "downloads"
  | "selectedDownloads"
  | "activeVariantArchive"
  | "isMap"
>;

export type GroupRandomizerPool<T> = {
  group: ModGroup;
  pool: T[];
  active: T[];
};

export const randomizedGroupModIds = (
  groups: readonly ModGroup[],
): Set<string> =>
  new Set(
    groups.filter((group) => group.randomize).flatMap((group) => group.modIds),
  );

export function groupRandomizerPools<T extends GroupRandomizableMod>(
  groups: readonly ModGroup[],
  mods: readonly T[],
  manifest?: VpkManifest,
): GroupRandomizerPool<T>[] {
  const byId = new Map(mods.map((mod) => [mod.remoteId, mod]));
  const pools: GroupRandomizerPool<T>[] = [];
  for (const group of groups) {
    if (!group.randomize) {
      continue;
    }
    const members = group.modIds.flatMap((id) => byId.get(id) ?? []);
    const pool = members.filter(
      (mod) =>
        (mod.status === ModStatus.Downloaded ||
          mod.status === ModStatus.Installed) &&
        !mod.isMap &&
        (canRandomizeMod(mod) ||
          (!mod.usesCriticalPaths &&
            previousInstallSelection(mod, manifest) !== undefined)),
    );
    if (isRandomizedPool(pool)) {
      pools.push({
        group,
        pool,
        active: members.filter((mod) => mod.status === ModStatus.Installed),
      });
    }
  }
  return pools;
}
