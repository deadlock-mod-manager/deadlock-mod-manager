export type GameConfigAlert = {
  /** gameinfo.gi lost our search paths, so enabled mods won't load. */
  modsDetached: boolean;
  /** Steam installed a build the user hasn't been told about yet. */
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

  // A vanilla launch strips the search paths on purpose, so on its own that is
  // not breakage. After an update, Steam has rewritten the file either way.
  const modsDetached =
    hasModPaths === false &&
    enabledModsCount > 0 &&
    (!lastLaunchVanilla || gameUpdated);

  return modsDetached || gameUpdated ? { modsDetached, gameUpdated } : null;
};
