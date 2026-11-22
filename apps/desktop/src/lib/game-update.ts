export type GameConfigAlert = {
  modsDetached: boolean;
  gameUpdated: boolean;
};

type AlertInput = {
  buildId: number | null;
  knownBuildId: number | null;
  hasModPaths: boolean | undefined;
  enabledModsCount: number;
  lastLaunchVanilla: boolean;
};

export const deriveGameConfigAlert = ({
  buildId,
  knownBuildId,
  hasModPaths,
  enabledModsCount,
  lastLaunchVanilla,
}: AlertInput): GameConfigAlert | null => {
  const gameUpdated =
    buildId != null && knownBuildId != null && buildId !== knownBuildId;

  const modsDetached =
    hasModPaths === false &&
    enabledModsCount > 0 &&
    (!lastLaunchVanilla || gameUpdated);

  return modsDetached || gameUpdated ? { modsDetached, gameUpdated } : null;
};
