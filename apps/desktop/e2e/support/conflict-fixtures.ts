import { prepareInstalledProfiles } from "./profile-fixtures";
import { buildSyntheticVpk, type VpkRecipeEntry } from "./vpk";
import type { CreatedWorld } from "./world";

export const CONFLICTS = {
  id: "profile_300_conflicts",
  folder: "profile_300_conflicts_conflicts",
  name: "E2E Conflicts",
};

export const HAT_JACKET = "local-conflict-hat-jacket";
export const HAT_PANTS = "local-conflict-hat-pants";
export const PANTS_TEXTURE = "local-conflict-pants-texture";
export const CONFLICT_MODS = [HAT_JACKET, HAT_PANTS, PANTS_TEXTURE];

const SHARED_JACKET = "jacket model, identical in two mods\n";

// Mods load in this order, so the first one wins every file it shares:
// - hat-jacket and hat-pants replace the same model (critical).
// - hat-pants and pants-texture replace the same material (normal).
// - hat-jacket and pants-texture ship a byte-identical jacket, which is not a
//   conflict, and every mod carries packer noise that must be skipped.
const RECIPES = new Map<string, readonly VpkRecipeEntry[]>([
  [
    HAT_JACKET,
    [
      { path: "models/outfit/hat.vmdl_c", contents: "hat from hat-jacket\n" },
      { path: "models/outfit/jacket.vmdl_c", contents: SHARED_JACKET },
      { path: "addoninfo.txt", contents: "hat-jacket addon info\n" },
      { path: "readme.txt", contents: "hat-jacket readme\n" },
    ],
  ],
  [
    HAT_PANTS,
    [
      { path: "models/outfit/hat.vmdl_c", contents: "hat from hat-pants\n" },
      { path: "models/outfit/pants.vmdl_c", contents: "pants model\n" },
      {
        path: "materials/outfit/pants.vmat_c",
        contents: "pants material from hat-pants\n",
      },
      { path: "addoninfo.txt", contents: "hat-pants addon info\n" },
    ],
  ],
  [
    PANTS_TEXTURE,
    [
      {
        path: "materials/outfit/pants.vmat_c",
        contents: "pants material from pants-texture\n",
      },
      { path: "models/outfit/jacket.vmdl_c", contents: SHARED_JACKET },
      { path: "addoninfo.txt", contents: "pants-texture addon info\n" },
      { path: "readme.txt", contents: "pants-texture readme\n" },
    ],
  ],
]);

export const conflictPayload = (modId: string): Buffer => {
  const recipe = RECIPES.get(modId);
  if (!recipe) throw new Error(`No conflict recipe for ${modId}`);
  return buildSyntheticVpk(recipe);
};

export const prepareConflictWorld = (world: CreatedWorld): Promise<void> =>
  prepareInstalledProfiles(
    world,
    [{ profile: CONFLICTS, modIds: CONFLICT_MODS, payload: conflictPayload }],
    CONFLICTS.id,
  );
