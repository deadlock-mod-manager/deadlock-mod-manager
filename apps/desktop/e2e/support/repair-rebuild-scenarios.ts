import {
  FIXED_MOD,
  PLAIN_MOD,
  prepareFixedStatusWorld,
} from "./fixed-status-fixtures";
import type { Definition } from "./scenarios";

/**
 * Cases where a fixed mod's saved repair goes stale and DMM should rebuild it
 * by itself, plus a restart control. `base` is the compatibility family's
 * scenario settings; each case prepares a fixed mod and a plain skin.
 */
export const repairRebuildScenarios = (
  base: Omit<Definition, "spec" | "phases">,
) => {
  const repairRebuild = (
    spec: string,
    phases: readonly string[],
  ): Definition => ({
    ...base,
    spec,
    phases,
    prepare: async (world) =>
      prepareFixedStatusWorld(world, [FIXED_MOD, PLAIN_MOD]),
  });
  const gameFiles = () =>
    repairRebuild("compatibility-rebuild-game-files", [
      "fix",
      "restart-changed",
    ]);
  return {
    "compatibility-rebuild-after-close": repairRebuild(
      "compatibility-rebuild-after-close",
      ["toggle-close", "restart-after-close"],
    ),
    "compatibility-rebuild-restart": gameFiles(),
    "compatibility-rebuild-steam-rewrite": gameFiles(),
    "compatibility-rebuild-game-update": gameFiles(),
    "compatibility-rebuild-app-update": gameFiles(),
    "compatibility-rebuild-new-data": repairRebuild(
      "compatibility-rebuild-new-data",
      ["install", "restart-installed"],
    ),
  };
};
