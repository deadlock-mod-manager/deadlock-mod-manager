import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { fixtureMod } from "./mod-fixtures";
import { readPersistedDocument } from "./observations";
import {
  BETA,
  BETA_MODS,
  prepareInstalledProfiles,
  profilePayload,
} from "./profile-fixtures";
import type { CreatedWorld } from "./world";

export const DEFAULT_MOD = "local-default-skin";

/**
 * The Default profile owns an enabled mod in the root addons folder and Beta
 * owns its own mods. gameinfo.gi carries the unmarked `Game citadel/addons`
 * line that manual modding guides tell players to add before they use DMM.
 */
export const prepareProfileSwitchLeakWorld = async (world: CreatedWorld) => {
  await prepareInstalledProfiles(
    world,
    [{ profile: BETA, modIds: BETA_MODS }],
    "default",
  );
  const citadel = path.join(world.configuration.roots.game, "game", "citadel");
  const addons = path.join(citadel, "addons");
  await writeFile(
    path.join(addons, "pak01_dir.vpk"),
    profilePayload(DEFAULT_MOD),
  );
  await writeFile(
    path.join(addons, ".dmm.json"),
    JSON.stringify(
      {
        version: 3,
        mods: {
          [DEFAULT_MOD]: {
            enabled: true,
            order: 0,
            shard: 1,
            currentVpks: ["pak01_dir.vpk"],
            disabledVpks: [],
            originalVpkNames: [`${DEFAULT_MOD}.vpk`],
          },
        },
      },
      null,
      2,
    ),
  );

  const mod = fixtureMod(DEFAULT_MOD, 0);
  const persisted = z
    .object({
      version: z.number(),
      state: z
        .object({
          profiles: z.record(z.string(), z.record(z.string(), z.json())),
        })
        .catchall(z.json()),
    })
    .parse(await readPersistedDocument(world.directory));
  const profiles = {
    ...persisted.state.profiles,
    default: {
      ...persisted.state.profiles.default,
      mods: [mod],
      enabledMods: {
        [DEFAULT_MOD]: {
          remoteId: DEFAULT_MOD,
          enabled: true,
          lastModified: new Date(0),
        },
      },
    },
  };
  await writeFile(
    path.join(world.configuration.roots.appData, "state.json"),
    JSON.stringify({
      "local-config": JSON.stringify({
        ...persisted,
        state: { ...persisted.state, profiles, localMods: [mod] },
      }),
    }),
  );

  const gameinfo = path.join(citadel, "gameinfo.gi");
  const original = await readFile(gameinfo, "utf8");
  const withStray = original.replace(
    "Game citadel\n",
    "Game citadel/addons\n      Game citadel\n",
  );
  // Without the line the case would pass without exercising the leak.
  if (withStray === original)
    throw new Error("gameinfo.gi has no Game citadel line to follow");
  await writeFile(gameinfo, withStray);
};
