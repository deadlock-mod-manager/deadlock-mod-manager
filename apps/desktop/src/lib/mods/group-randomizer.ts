import { canRandomizeMod, isRandomizedPool } from "@/lib/mods/skin-randomizer";
import { type LocalMod, ModStatus } from "@/types/mods";
import type { ModGroup } from "@/types/profiles";

type GroupRandomizableMod = Pick<
  LocalMod,
  | "remoteId"
  | "status"
  | "usesCriticalPaths"
  | "installedFileTree"
  | "installedVpks"
>;

export type GroupRandomizerPool<T> = {
  group: ModGroup;
  /** Members the launch can install without asking anything. */
  pool: T[];
  /** Members installed right now, randomizable or not. */
  active: T[];
};

/** Every mod in a group that rolls on launch, by remoteId. */
export const randomizedGroupModIds = (
  groups: readonly ModGroup[],
): Set<string> =>
  new Set(
    groups.filter((group) => group.randomize).flatMap((group) => group.modIds),
  );

/**
 * The randomized groups that have something to choose between. Every installed
 * member is listed as active so the roll takes off whatever the group had on,
 * including members that can't be rolled themselves.
 */
export function groupRandomizerPools<T extends GroupRandomizableMod>(
  groups: readonly ModGroup[],
  mods: readonly T[],
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
        canRandomizeMod(mod),
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
