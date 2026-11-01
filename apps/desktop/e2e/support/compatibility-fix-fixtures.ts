import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FixtureRoute } from "./fixture-server";
import { prepareInstalledProfiles } from "./profile-fixtures";
import { buildSyntheticVpk, type VpkRecipeEntry } from "./vpk";
import type { CreatedWorld } from "./world";

export const FIXES = {
  id: "profile_400_fixes",
  folder: "profile_400_fixes_fixes",
  name: "E2E Fixes",
};

export const FIXED_MOD = "local-fix-hero-names";
export const UNRELATED_MOD = "local-fix-unrelated-skin";
export const OTHER_MOD = "local-fix-other-skin";
export const NEW_MOD_FILE = "local-fix-new-skin.vpk";
const FIX_MODS = [FIXED_MOD, UNRELATED_MOD, OTHER_MOD];

// Fixing a mod that changes localization tokens always produces a repair
// package, so this mod stands in for any mod whose fix writes the overlay.
// The other two share no files with it, only a material with each other, so
// the Conflicts tab can reorder them.
const RECIPES = new Map<string, readonly VpkRecipeEntry[]>([
  [
    FIXED_MOD,
    [
      {
        path: "resource/localization/citadel_heroes/citadel_heroes_english.txt",
        contents:
          '"lang"\n{\n\t"Language"\t\t"English"\n\t"Tokens"\n\t{\n\t\t"hero_e2e"\t\t"Fixed hero name"\n\t}\n}\n',
      },
    ],
  ],
  [
    UNRELATED_MOD,
    [
      { path: "models/outfit/hat.vmdl_c", contents: "unrelated hat\n" },
      { path: "materials/outfit/pants.vmat_c", contents: "unrelated pants\n" },
    ],
  ],
  [
    OTHER_MOD,
    [
      { path: "models/outfit/boots.vmdl_c", contents: "other boots\n" },
      { path: "materials/outfit/pants.vmat_c", contents: "other pants\n" },
    ],
  ],
]);

const fixPayload = (modId: string): Buffer => {
  const recipe = RECIPES.get(modId);
  if (!recipe) throw new Error(`No compatibility fix recipe for ${modId}`);
  return buildSyntheticVpk(recipe);
};

export const prepareCompatibilityFixWorld = async (
  world: CreatedWorld,
): Promise<void> => {
  await prepareInstalledProfiles(
    world,
    [{ profile: FIXES, modIds: FIX_MODS, payload: fixPayload }],
    FIXES.id,
  );
  // Imported from disk during the run, as a newly installed mod.
  const fixtures = path.join(world.directory, "fixtures");
  await mkdir(fixtures, { recursive: true });
  await writeFile(
    path.join(fixtures, NEW_MOD_FILE),
    buildSyntheticVpk([
      { path: "models/outfit/gloves.vmdl_c", contents: "new gloves\n" },
    ]),
  );
};

export const ENABLED_FIX_MOD = "local-fix-enabled-text";
export const DISABLED_FIX_MOD = "local-fix-disabled-text";
const DISABLED_FIX_MODS = [ENABLED_FIX_MOD, DISABLED_FIX_MOD];

const localization = (tokens: Record<string, string>) =>
  `"lang"\n{\n\t"Language"\t\t"English"\n\t"Tokens"\n\t{\n${Object.entries(
    tokens,
  )
    .map(([token, text]) => `\t\t"${token}"\t\t"${text}"\n`)
    .join("")}\t}\n}\n`;
const textFile = (modId: string) =>
  `resource/localization/${modId}/${modId}_english.txt`;

// A mod's copy of a game text file that lacks a game token gets the token
// restored, so the health check reports each of these mods as fixable.
export const prepareDisabledFixWorld = async (
  world: CreatedWorld,
): Promise<void> => {
  const citadel = path.join(world.configuration.roots.game, "game", "citadel");
  for (const modId of DISABLED_FIX_MODS) {
    const file = path.join(citadel, textFile(modId));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(
      file,
      localization({ e2e_kept: "Kept", e2e_new: "New game text" }),
    );
  }
  await prepareInstalledProfiles(
    world,
    [
      {
        profile: FIXES,
        modIds: DISABLED_FIX_MODS,
        payload: (modId) =>
          buildSyntheticVpk([
            {
              path: textFile(modId),
              contents: localization({ e2e_kept: "Kept" }),
            },
          ]),
      },
    ],
    FIXES.id,
  );
};

// The spec opens the disabled mod's page, which asks for its report counts.
export const disabledFixRoutes = (): FixtureRoute[] => [
  { method: "GET", path: "/api/v2/feature-flags", status: 200, body: "[]" },
  {
    method: "GET",
    path: `/api/v2/reports/mod/${DISABLED_FIX_MOD}/counts`,
    status: 200,
    body: JSON.stringify({ total: 0, open: 0, resolved: 0, dismissed: 0 }),
  },
];
