import type { PerfTier } from "../src/schema";

/**
 * GameBanana configs we list but never redistribute: the app downloads the
 * file from GameBanana and runs it through the import review. Configs that are
 * the same as a curated preset (Sqooky 656341, OptiLock 678180/690233) are left
 * out. `sources.json` pins the file id and md5; the generator downloads it only
 * to compute the stats below and keeps no file content.
 */
export interface CommunityDefinition {
  gamebananaId: number;
  /** Stable id in the catalog. */
  id: string;
  tier: PerfTier;
  blurb: string;
  /** Path fragment of the gameinfo variant to analyze and import by default. */
  variantHint: string;
  /** Pin this file instead of the newest live one (the mod lists several configs). */
  fileId?: number;
}

export const COMMUNITY: CommunityDefinition[] = [
  {
    gamebananaId: 616141,
    id: "gb-dyson",
    tier: "potato",
    blurb:
      "Long-running config with translated copies in 15 languages; it also ships a Doorman door fix VPK and a stock gameinfo.gi.",
    variantHint: "russian/gameinfo.gi",
  },
  {
    gamebananaId: 671812,
    id: "gb-optimizationdl",
    tier: "sweaty",
    blurb: "Competitive config by back3p. The archive also contains VPK mods.",
    variantHint: "qq/gameinfo.gi",
  },
  {
    gamebananaId: 650519,
    id: "gb-optimisationlock",
    tier: "balanced",
    blurb:
      "Repost of Piggy's config from OptimizationLock (a second file holds Kaizuchaneru's minimum spec config).",
    variantHint: "piggy's config/gameinfo.gi",
    fileId: 1670703,
  },
  {
    gamebananaId: 609804,
    id: "gb-hanturaya-competitive",
    tier: "sweaty",
    blurb: "Hanturaya's competitive config; ConVars edits only.",
    variantHint: "gameinfo.gi",
  },
  {
    gamebananaId: 673077,
    id: "gb-max-fps-small-changes",
    tier: "potato",
    blurb:
      "boot's max FPS config with the LOD override, decals and shop portraits set back to their defaults.",
    variantHint: "gameinfo.gi",
  },
  {
    gamebananaId: 658776,
    id: "gb-deadlock-competitive",
    tier: "sweaty",
    blurb:
      "Competitive config by SHR1KN, built for the March 2026 patch. Ships a video.txt and an enemy outline VPK.",
    variantHint: "gameinfo.gi",
  },
  {
    gamebananaId: 722944,
    id: "gb-sidelock",
    tier: "potato",
    blurb:
      "Config designed for Vulkan. Licensed CC BY-NC-ND 4.0, so it is only available from GameBanana.",
    variantHint: "gameinfo.gi",
  },
];
