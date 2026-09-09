import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ModStatus, type LocalMod } from "../../src/types/mods";
import { buildSyntheticVpk } from "./vpk";
import { collectFileInventory, type CreatedWorld } from "./world";

export const ALPHA = {
  id: "profile_100_alpha",
  folder: "profile_100_alpha_alpha",
  name: "E2E Alpha",
};
export const BETA = {
  id: "profile_200_beta",
  folder: "profile_200_beta_beta",
  name: "E2E Beta",
};
export const ALPHA_MODS = [
  "local-alpha-one",
  "local-alpha-two",
  "local-alpha-three",
];
export const BETA_MODS = ["local-beta-one", "local-beta-two"];

export const profilePayload = (modId: string): Buffer =>
  buildSyntheticVpk([
    {
      path: "scripts/profile-fixture.txt",
      contents: `Distinct payload for ${modId}\n`,
    },
  ]);

export const fixtureMod = (modId: string, index: number): LocalMod => ({
  id: modId,
  remoteId: modId,
  name: modId,
  description: "E2E profile fixture",
  remoteUrl: "local://manual",
  category: "Skins",
  likes: 0,
  author: "E2E",
  downloadable: false,
  tags: [],
  dependencies: [],
  metadata: null,
  images: [],
  hero: null,
  isAudio: false,
  isMap: false,
  audioUrl: null,
  downloadCount: 0,
  isNSFW: false,
  isObsolete: false,
  isBlacklisted: false,
  blacklistReason: null,
  blacklistedAt: null,
  blacklistedBy: null,
  filesUpdatedAt: null,
  overrides: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  remoteAddedAt: new Date(0),
  remoteUpdatedAt: new Date(0),
  status: ModStatus.Installed,
  installedVpks: [`pak${String(index + 1).padStart(2, "0")}_dir.vpk`],
  installOrder: index,
  // These synthetic script archives contain no hero assets. Model them as
  // already indexed so unrelated background scans cannot race a test restart.
  detectedHero: null,
  usesCriticalPaths: false,
});

export const prepareProfileWorld = async (
  world: CreatedWorld,
  alphaModIds: string[] = ALPHA_MODS,
  alphaSlots?: number[],
): Promise<void> => {
  const profiles: Record<
    string,
    {
      id: string;
      name: string;
      folderName: string | null;
      isDefault: boolean;
      createdAt: Date;
      mods: LocalMod[];
      enabledMods: Record<
        string,
        { remoteId: string; enabled: boolean; lastModified: Date }
      >;
    }
  > = {
    default: {
      id: "default",
      name: "Default Profile",
      folderName: null,
      isDefault: true,
      createdAt: new Date(0),
      mods: [],
      enabledMods: {},
    },
  };
  for (const { profile, modIds } of [
    { profile: ALPHA, modIds: alphaModIds },
    { profile: BETA, modIds: BETA_MODS },
  ]) {
    const directory = path.join(
      world.configuration.roots.game,
      "game",
      "citadel",
      "addons",
      profile.folder,
    );
    await mkdir(directory, { recursive: true });
    const mods = modIds.map((id, index) =>
      fixtureMod(
        id,
        profile.id === ALPHA.id && alphaSlots
          ? alphaSlots[index] - 1
          : index % 99,
      ),
    );
    const entries: Record<
      string,
      {
        enabled: boolean;
        order: number;
        shard: number;
        currentVpks: string[];
        disabledVpks: string[];
        originalVpkNames: string[];
      }
    > = {};
    for (const [index, mod] of mods.entries()) {
      mod.installOrder = index;
      const filename = `pak${String(profile.id === ALPHA.id && alphaSlots ? alphaSlots[index] : (index % 99) + 1).padStart(2, "0")}_dir.vpk`;
      const shard = Math.floor(index / 99) + 1;
      const shardDirectory =
        shard === 1
          ? directory
          : path.join(
              world.configuration.roots.game,
              "game",
              "citadel",
              `addons${shard}`,
              profile.folder,
            );
      await mkdir(shardDirectory, { recursive: true });
      await writeFile(
        path.join(shardDirectory, filename),
        profilePayload(mod.remoteId),
      );
      entries[mod.remoteId] = {
        enabled: true,
        order: index,
        shard,
        currentVpks: [filename],
        disabledVpks: [],
        originalVpkNames: [`${mod.remoteId}.vpk`],
      };
    }
    await writeFile(
      path.join(directory, ".dmm.json"),
      JSON.stringify({ version: 3, mods: entries }, null, 2),
    );
    await writeFile(
      path.join(directory, "protected.txt"),
      `Protected ${profile.name}\n`,
    );
    profiles[profile.id] = {
      id: profile.id,
      name: profile.name,
      folderName: profile.folder,
      isDefault: false,
      createdAt: new Date(0),
      mods,
      enabledMods: Object.fromEntries(
        mods.map((mod) => [
          mod.remoteId,
          { remoteId: mod.remoteId, enabled: true, lastModified: new Date(0) },
        ]),
      ),
    };
  }
  const storePath = path.join(world.configuration.roots.appData, "state.json");
  const store = z
    .object({ "local-config": z.string() })
    .parse(JSON.parse(await readFile(storePath, "utf8")));
  const persisted = z
    .object({ state: z.record(z.string(), z.json()), version: z.number() })
    .parse(JSON.parse(store["local-config"]));
  await writeFile(
    storePath,
    JSON.stringify({
      "local-config": JSON.stringify({
        ...persisted,
        state: {
          ...persisted.state,
          profiles,
          activeProfileId: ALPHA.id,
          localMods: profiles[ALPHA.id].mods,
        },
      }),
    }),
  );
  const gameinfo = path.join(
    world.configuration.roots.game,
    "game",
    "citadel",
    "gameinfo.gi",
  );
  await writeFile(
    gameinfo,
    (await readFile(gameinfo, "utf8")).replace(
      "Game citadel",
      `${Array.from({ length: Math.ceil(alphaModIds.length / 99) }, (_, index) => `Game citadel/${index === 0 ? "addons" : `addons${index + 1}`}/${ALPHA.folder}`).join("\n      ")}\n      Game citadel`,
    ),
  );
  await writeFile(
    path.join(world.artifactsDirectory, "profiles-initial.json"),
    JSON.stringify(
      {
        alpha: await collectFileInventory(
          path.join(
            world.configuration.roots.game,
            "game",
            "citadel",
            "addons",
            ALPHA.folder,
          ),
        ),
        beta: await collectFileInventory(
          path.join(
            world.configuration.roots.game,
            "game",
            "citadel",
            "addons",
            BETA.folder,
          ),
        ),
      },
      null,
      2,
    ),
  );
};
