import type { PerfTier } from "../src/schema";

/**
 * An upstream gameinfo.gi we pin. Presets point at one; the DMM Clean
 * consensus votes with all of them, one vote per lineage.
 */
export interface UpstreamFile {
  id: string;
  repo: string;
  path: string;
  /** The author's recommended in-game settings, shown as a checklist. */
  videoPath?: string;
  /** `tag`: pin the latest release tag. `branch`: pin the last commit touching `path`. */
  track: "tag" | "branch";
  license: string;
  /** Configs that derive from each other share a lineage and vote once. */
  lineage: string;
  /** Pulls the author's version label out of the file when there is no tag. */
  versionPattern?: RegExp;
}

export const UPSTREAM_FILES: UpstreamFile[] = [
  {
    id: "sqooky-default",
    repo: "Sqooky/OptimizationLock",
    path: "Sqooky's .gi/gameinfo.gi",
    track: "branch",
    license: "GPL-3.0",
    lineage: "sqooky",
    versionPattern: /OptimizationLock Version (\d[\w.]*)/,
  },
  {
    id: "sqooky-eskay",
    repo: "Sqooky/OptimizationLock",
    path: "Eskay's config/gameinfo.gi",
    track: "branch",
    license: "GPL-3.0",
    lineage: "sqooky",
    versionPattern: /Eskay's Preset (v\d[\w.]*)/,
  },
  {
    id: "sqooky-maxfps",
    repo: "Sqooky/OptimizationLock",
    path: "maximumfps or minimum spec config and resources here/gameinfo.gi",
    videoPath: "maximumfps or minimum spec config and resources here/video.txt",
    track: "branch",
    license: "GPL-3.0",
    lineage: "sqooky",
    versionPattern: /Maxfps Version (v?\d[\w.]*)/,
  },
  {
    id: "kaizu-minspec",
    repo: "Sqooky/OptimizationLock",
    path: "kaizuchanerus minimum spec/gameinfo.gi",
    track: "branch",
    license: "GPL-3.0",
    lineage: "kaizu",
  },
  {
    id: "kaizu-extremelow",
    repo: "Sqooky/OptimizationLock",
    path: "kaizuchanerus minimum spec/gameinfoextremelow.gi",
    track: "branch",
    license: "GPL-3.0",
    lineage: "kaizu",
  },
  {
    id: "boot-maxfps",
    repo: "Sqooky/OptimizationLock",
    path: "boot's maxium fps config/gameinfo.gi",
    track: "branch",
    license: "GPL-3.0",
    lineage: "boot",
  },
  {
    id: "piggy",
    repo: "Sqooky/OptimizationLock",
    path: "Piggy's config/gameinfo.gi",
    track: "branch",
    license: "GPL-3.0",
    lineage: "piggy",
  },
  {
    id: "optilock-fps",
    repo: "dacooderr/OptiLock",
    path: "OptiLock FPS Config (Recommended)/gameinfo.gi",
    videoPath: "OptiLock FPS Config (Recommended)/video.txt",
    track: "tag",
    license: "GPL-3.0",
    lineage: "optilock",
  },
  {
    id: "optilock-potato",
    repo: "dacooderr/OptiLock",
    path: "OptiLock Potato Config/gameinfo.gi",
    videoPath: "OptiLock Potato Config/video.txt",
    track: "tag",
    license: "GPL-3.0",
    lineage: "optilock",
  },
];

interface PresetDefinition {
  id: string;
  name: string;
  author: string;
  tier: PerfTier;
  blurb: string;
  highlights?: string[];
  notes?: string[];
  recommended?: boolean;
  /** `UpstreamFile.id`, or `null` for DMM's own consensus preset. */
  upstream: string | null;
}

/** Listing order in the app. */
export const PRESETS: PresetDefinition[] = [
  {
    id: "dmm-clean",
    name: "DMM Clean",
    author: "Deadlock Mod Manager",
    tier: "balanced",
    blurb:
      "The settings most community configs agree on, without anything that hides objects, changes the camera or what you can see, or overrides the in-game video menu.",
    highlights: [
      "Community consensus",
      "Keeps draw distance",
      "Keeps outlines & camera",
      "Video menu untouched",
    ],
    notes: [
      "Derived from OptimizationLock (Sqooky, Eskay, Kaizuchaneru, boot, Piggy) and OptiLock (dacooderr), GPL-3.0.",
    ],
    recommended: true,
    upstream: null,
  },
  {
    id: "optimizationlock",
    name: "OptimizationLock",
    author: "Sqooky",
    tier: "balanced",
    blurb:
      "Sqooky's main config. Upstream describes it as performance-oriented without making the game ugly and recommends it for most players.",
    notes: [
      "Upstream FAQ: if buildings pop in, raise r_farz or remove r_mapextents; if Victor or Paige show holes, raise sc_screen_size_lod_scale_override.",
    ],
    upstream: "sqooky-default",
  },
  {
    id: "eskay",
    name: "Eskay's Config",
    author: "Eskay",
    tier: "pretty",
    blurb:
      "A fork of Sqooky's config with moderate changes to suit Eskay's preferences.",
    upstream: "sqooky-eskay",
  },
  {
    id: "sqooky-max-fps",
    name: "Sqooky's Max FPS",
    author: "Sqooky",
    tier: "sweaty",
    blurb:
      "Sqooky's frame-rate-first config. Upstream marks it as under development and not fully documented.",
    notes: [
      "The in-game settings come from Liah's video.txt, which upstream ships next to this config.",
    ],
    upstream: "sqooky-maxfps",
  },
  {
    id: "kaizu-min-spec",
    name: "Kaizuchaneru's Minimum Spec",
    author: "Kaizuchaneru",
    tier: "potato",
    blurb:
      "Prioritizes frame rate above all else and lowers visual quality a lot. Upstream recommends it for weak computers.",
    notes: [
      "Upstream FAQ: hero portraits in the shop and end screen go dark (citadel_portrait_world_renderer_off) and Lash's ground slam is hard to see (r_drawdecals).",
    ],
    upstream: "kaizu-minspec",
  },
  {
    id: "optilock-fps",
    name: "OptiLock FPS (Recommended)",
    author: "dacooderr",
    tier: "sweaty",
    blurb:
      "dacooderr's recommended competitive config. Upstream ships it with a matching set of in-game video settings.",
    upstream: "optilock-fps",
  },
  {
    id: "optilock-potato",
    name: "OptiLock Potato",
    author: "dacooderr",
    tier: "potato",
    blurb:
      "dacooderr's lowest-quality config for weak hardware. Upstream ships it with a matching set of in-game video settings.",
    upstream: "optilock-potato",
  },
];
