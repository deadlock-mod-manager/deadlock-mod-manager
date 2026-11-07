import { writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { readPersistedDocument } from "./observations";
import { ALPHA, prepareInstalledProfiles } from "./profile-fixtures";
import { buildSyntheticVpk } from "./vpk";
import type { CreatedWorld } from "./world";

export const HAZE_CURRENT = "local-haze-current";
export const HAZE_SWAP = "local-haze-swap";

export const hazeModel = (modId: string) => `haze model from ${modId}\n`;

// Two Haze skins replacing the same model, the case the swap dialog exists for.
const heroSwapPayload = (modId: string): Buffer =>
  buildSyntheticVpk([
    {
      path: "models/heroes_staging/haze/haze.vmdl_c",
      contents: hazeModel(modId),
    },
    { path: "addoninfo.txt", contents: `${modId} addon info\n` },
  ]);

export const prepareHeroSwapWorld = async (world: CreatedWorld) => {
  await prepareInstalledProfiles(
    world,
    [
      {
        profile: ALPHA,
        modIds: [HAZE_CURRENT, HAZE_SWAP],
        payload: heroSwapPayload,
      },
    ],
    ALPHA.id,
  );
  const persisted = z
    .object({ state: z.record(z.string(), z.json()), version: z.number() })
    .parse(await readPersistedDocument(world.directory));
  const mods = z
    .array(z.object({ remoteId: z.string() }).catchall(z.json()))
    .parse(persisted.state.localMods)
    .map((mod) => ({ ...mod, hero: "Haze", detectedHero: "Haze" }));
  const profiles = z
    .record(z.string(), z.record(z.string(), z.json()))
    .parse(persisted.state.profiles);
  profiles[ALPHA.id] = { ...profiles[ALPHA.id], mods };
  persisted.state = { ...persisted.state, localMods: mods, profiles };
  await writeFile(
    path.join(world.configuration.roots.appData, "state.json"),
    JSON.stringify({ "local-config": JSON.stringify(persisted) }),
  );
};
