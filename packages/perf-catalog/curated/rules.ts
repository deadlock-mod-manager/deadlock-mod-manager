import type { CatalogRules } from "../src/schema";

export const RULES: CatalogRules = {
  excludedSections: ["FileSystem", "MaterialSystem2/RenderModes"],
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
