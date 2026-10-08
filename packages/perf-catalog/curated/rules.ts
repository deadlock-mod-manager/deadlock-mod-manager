import type { CatalogRules } from "../src/schema";

/**
 * What the app never writes. Excluded sections are dropped from preset entries
 * at generation time and reported as excluded at import time; guarded sections
 * are the ones Valve's matchmaking message names (`Citadel_StartMatchmaking_UnverifiedPGI`,
 * build 6417), which the app only writes when the user includes engine sections.
 */
export const RULES: CatalogRules = {
  excludedSections: [
    "FileSystem",
    "MaterialSystem2/RenderModes",
    "Hammer",
    "pulse",
    "ResourceCompiler",
    "ContentBuilder",
    "SoundTool",
    "ToolsEnvironment",
    "MaterialEditor",
    "ModelDoc",
    "NavSystem",
    "Localize",
    "SupportedLanguages",
    "hidden_maps",
    "Source1Import",
  ],
  guardedSections: [
    "Engine2",
    "MaterialSystem2",
    "NetworkSystem",
    "Particles",
    "RenderSystem",
    "SceneSystem",
    "WorldRenderer",
  ],
  denied: [
    {
      path: ["ConVars", "sv_cheats"],
      reason: "Turns on cheats; it has no place in a performance config.",
    },
    {
      pattern: "^(host_)?timescale$",
      reason: "Changes the speed of the game.",
    },
    {
      path: ["Engine2", "RenderingPipeline", "DistanceField"],
      reason:
        "Setting it to 0 crashes the current game build after the hideout loads.",
    },
    {
      path: ["ConVars", "r_render_portals"],
      reason: "Turning portals off breaks Doorman's door.",
    },
    {
      path: ["Engine2", "LocalServerClientAccess"],
      reason: "Engine plumbing for local servers, not a performance setting.",
    },
  ],
};
