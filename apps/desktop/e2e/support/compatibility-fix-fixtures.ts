import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
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
