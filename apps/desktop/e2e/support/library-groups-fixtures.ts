import { writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { catalogVpk } from "./gamebanana-fixtures";
import { readPersistedDocument } from "./observations";
import {
  ALPHA,
  ALPHA_MODS,
  BETA,
  prepareInstalledProfiles,
} from "./profile-fixtures";
import type { CreatedWorld } from "./world";

export const GROUP_BETA_MODS = [
  ALPHA_MODS[0],
  ALPHA_MODS[2],
  "local-beta-only",
];
export const GROUP_PROFILE_LAYOUT = [
  { profile: ALPHA, modIds: ALPHA_MODS },
  { profile: BETA, modIds: GROUP_BETA_MODS },
];

export const prepareLibraryGroupsWorld = (world: CreatedWorld) =>
  prepareInstalledProfiles(world, GROUP_PROFILE_LAYOUT, ALPHA.id);

export const PAGINATED_MODS = [
  ...Array.from(
    { length: 24 },
    (_, index) => `local-page-${String(index + 1).padStart(2, "0")}`,
  ),
  "local-featured-map",
];
export const PAGINATED_LAYOUT = [
  { profile: ALPHA, modIds: PAGINATED_MODS },
  { profile: BETA, modIds: GROUP_BETA_MODS },
];
export const preparePaginatedGroupsWorld = async (world: CreatedWorld) => {
  await prepareInstalledProfiles(world, PAGINATED_LAYOUT, ALPHA.id);
  const persisted = z
    .object({ state: z.record(z.string(), z.json()), version: z.number() })
    .parse(await readPersistedDocument(world.directory));
  await writeFile(
    path.join(world.configuration.roots.appData, "state.json"),
    JSON.stringify({
      "local-config": JSON.stringify({
        ...persisted,
        state: {
          ...persisted.state,
          settings: { "mods-store-pagination": { enabled: true } },
        },
      }),
    }),
  );
};

export const prepareGroupedIdentificationWorld = (world: CreatedWorld) =>
  prepareInstalledProfiles(
    world,
    [
      {
        profile: ALPHA,
        modIds: ["local-unidentified"],
        payload: () => catalogVpk("common.vpk"),
      },
    ],
    ALPHA.id,
  );
