import type { LocalMod } from "@/types/mods";

export type ProfileReorderData = [string, string[], number];
export type UpdatedVpkMappings = Array<[string, string[]]>;

type ReorderableMod = Pick<
  LocalMod,
  "remoteId" | "installedVpks" | "installOrder"
>;

export const buildProfileReorderData = (
  mods: ReorderableMod[],
): ProfileReorderData[] =>
  mods
    .map((mod, index) => ({ mod, index }))
    .filter(
      ({ mod }) =>
        Array.isArray(mod.installedVpks) && mod.installedVpks.length > 0,
    )
    .sort((left, right) => {
      const orderDifference =
        (left.mod.installOrder ?? Number.MAX_SAFE_INTEGER) -
        (right.mod.installOrder ?? Number.MAX_SAFE_INTEGER);

      if (orderDifference !== 0) {
        return orderDifference;
      }

      return left.index - right.index;
    })
    .map(({ mod }, index) => [mod.remoteId, mod.installedVpks ?? [], index]);

export const applyUpdatedVpkMappings = <T extends ReorderableMod>(
  mods: T[],
  updatedVpkMappings: UpdatedVpkMappings,
): T[] => {
  const updatedVpksByRemoteId = new Map(updatedVpkMappings);

  return mods.map((mod) => {
    const updatedVpks = updatedVpksByRemoteId.get(mod.remoteId);

    if (!updatedVpks) {
      return mod;
    }

    return {
      ...mod,
      installedVpks: updatedVpks,
    };
  });
};
