import { readPersistedDocument } from "./observations";
import { fixtureMod } from "./mod-fixtures";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { type LocalMod } from "../../src/types/mods";
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

export const prepareInstalledProfiles = async (
  world: CreatedWorld,
  layout: readonly {
    profile: typeof ALPHA;
    modIds: string[];
    slots?: number[];
  }[],
  activeProfileId: string,
): Promise<void> => {
  const active = layout.find(({ profile }) => profile.id === activeProfileId);
  if (!active)
    throw new Error("Active profile is missing from the fixture recipe");
  if (
    new Set(layout.map(({ profile }) => profile.id)).size !== layout.length ||
    new Set(layout.map(({ profile }) => profile.folder)).size !== layout.length
  )
    throw new Error("Profile recipe identities and folders must be unique");
  for (const { profile, modIds, slots } of layout) {
    if (profile.id === "default" || !/^[a-z0-9_-]+$/i.test(profile.folder))
      throw new Error("Unsafe fixture profile folder");
    if (new Set(modIds).size !== modIds.length)
      throw new Error("Duplicate fixture mod identity");
    if (
      slots &&
      (slots.length !== modIds.length ||
        new Set(slots).size !== slots.length ||
        slots.some((slot) => !Number.isInteger(slot) || slot < 1 || slot > 99))
    )
      throw new Error("Invalid fixture VPK slots");
  }
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
  for (const { profile, modIds, slots } of layout) {
    const directory = path.join(
      world.configuration.roots.game,
      "game",
      "citadel",
      "addons",
      profile.folder,
    );
    await mkdir(directory, { recursive: true });
    const mods = modIds.map((id, index) =>
      fixtureMod(id, slots ? slots[index] - 1 : index % 99),
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
      const filename = `pak${String(slots ? slots[index] : (index % 99) + 1).padStart(2, "0")}_dir.vpk`;
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
  const persisted = z
    .object({ state: z.record(z.string(), z.json()), version: z.number() })
    .parse(await readPersistedDocument(world.directory));
  await writeFile(
    storePath,
    JSON.stringify({
      "local-config": JSON.stringify({
        ...persisted,
        state: {
          ...persisted.state,
          profiles,
          activeProfileId,
          localMods: profiles[activeProfileId].mods,
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
      `${Array.from({ length: Math.max(1, Math.ceil(active.modIds.length / 99)) }, (_, index) => `Game citadel/${index === 0 ? "addons" : `addons${index + 1}`}/${active.profile.folder}`).join("\n      ")}\n      Game citadel`,
    ),
  );
};

export const prepareProfileWorld = async (
  world: CreatedWorld,
  alphaModIds: string[] = ALPHA_MODS,
  alphaSlots?: number[],
): Promise<void> => {
  await prepareInstalledProfiles(
    world,
    [
      { profile: ALPHA, modIds: alphaModIds, slots: alphaSlots },
      { profile: BETA, modIds: BETA_MODS },
    ],
    ALPHA.id,
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
