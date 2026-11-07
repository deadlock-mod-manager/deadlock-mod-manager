import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  prepareGameinfoRecoveryWorld,
  RECOVERY_MOD,
  VANILLA_GAMEINFO,
} from "./gameinfo-recovery-fixtures";
import {
  ALPHA,
  BETA,
  prepareInstalledProfiles,
  profilePayload,
} from "./profile-fixtures";
import type { CreatedWorld } from "./world";

export const HYPERLINE_PATHS = [
  "      // HYPERLINE STARTUP BEGIN",
  "      Game citadel/hyperline/startup",
  "      Mod citadel",
  "      Write citadel",
  "      // HYPERLINE STARTUP END",
  "      // HYPERLINE PANORAMA BEGIN",
  '      "Game" "citadel/hyperline/panorama" [$WIN64]',
  "      // HYPERLINE PANORAMA END",
  "      Game citadel/addons/user_owned // Keep this unrelated addon mount",
  "      Game citadel/addons/profile_external",
].join("\r\n");

export const PRESERVED_GAMEINFO = [
  '\uFEFF"GameInfo"',
  "{",
  "  // SearchPaths { and citadel/addons in a comment — café",
  "  FileSystem",
  "  {",
  '    "SearchPaths" // Mounts shared with other tools',
  "    {",
  "      Game_UILanguage citadel_*LANGUAGE*",
  "      Game_LowViolence citadel_lv",
  HYPERLINE_PATHS,
  "      Game citadel",
  "      Game core",
  "    }",
  "  }",
  '  ConVars { "fps_max" "240" } // User performance settings',
  "}",
].join("\r\n");

export const LEGACY_GAMEINFO = PRESERVED_GAMEINFO.replace(
  '    "SearchPaths"',
  '// Deadlock Mod Manager - Start\r\n    "SearchPaths"',
)
  .replace(
    "      Game citadel\r\n",
    "      Game citadel/addons/server_stale\r\n      Game citadel\r\n",
  )
  .replace("    }\r\n  }", "    }\r\n// Deadlock Mod Manager - End\r\n  }");

export const prepareGameinfoPreservationWorld = async (world: CreatedWorld) => {
  await prepareGameinfoRecoveryWorld(world);
  await prepareInstalledProfiles(
    world,
    [
      { profile: ALPHA, modIds: [RECOVERY_MOD] },
      { profile: BETA, modIds: ["local-beta-one"] },
    ],
    ALPHA.id,
  );
  const source = path.join(
    world.configuration.roots.appData,
    "mods",
    "local-beta-one",
    "files",
  );
  await mkdir(source, { recursive: true });
  await writeFile(
    path.join(source, "local-beta-one.vpk"),
    profilePayload("local-beta-one"),
  );
  const citadel = path.join(world.configuration.roots.game, "game", "citadel");
  if (world.configuration.caseId === "gameinfo-preserve-legacy-search-paths") {
    const stale = path.join(citadel, "addons", "server_stale");
    await mkdir(stale, { recursive: true });
    await writeFile(
      path.join(stale, ".dmm.json"),
      JSON.stringify({ version: 3, mods: {} }),
    );
  }
  await writeFile(
    path.join(citadel, "gameinfo.gi"),
    world.configuration.caseId === "gameinfo-preserve-legacy-search-paths"
      ? LEGACY_GAMEINFO
      : PRESERVED_GAMEINFO,
  );
  // This stale backup must never replace the user's newer custom configuration.
  await writeFile(path.join(citadel, "gameinfo.gi.bak"), VANILLA_GAMEINFO);
};
