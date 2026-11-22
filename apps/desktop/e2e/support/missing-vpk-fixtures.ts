import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { readPersistedDocument } from "./observations";
import {
  ALPHA,
  BETA,
  prepareInstalledProfiles,
  profilePayload,
} from "./profile-fixtures";
import { collectFileInventory, type CreatedWorld } from "./world";

export const MISSING = {
  enabled: "local-alpha-enabled",
  parked: "local-alpha-parked",
  intact: "local-alpha-intact",
  pair: "local-alpha-pair",
  stored: "local-alpha-stored",
  betaEnabled: "local-beta-enabled",
  betaIntact: "local-beta-intact",
} as const;

export const ALPHA_MISSING_MODS: readonly string[] = [
  MISSING.enabled,
  MISSING.parked,
  MISSING.intact,
  MISSING.pair,
  MISSING.stored,
];
export const BETA_MISSING_MODS: readonly string[] = [
  MISSING.betaEnabled,
  MISSING.betaIntact,
];

export const REMOVED_ALPHA_MODS: readonly string[] = [
  MISSING.enabled,
  MISSING.parked,
];
export const KEPT_ALPHA_MODS: readonly string[] = [
  MISSING.intact,
  MISSING.pair,
  MISSING.stored,
];

export const PARKED_VPK = `${MISSING.parked}_${MISSING.parked}.vpk`;
export const PAIR_SECOND_PAYLOAD = `${MISSING.pair}-second`;
export const STORED_SOURCE = `${MISSING.stored}.vpk`;

const ALPHA_SLOTS = [1, 2, 3, 4, 6];

export const profileDirectory = (gameRoot: string, folder: string) =>
  path.join(gameRoot, "game", "citadel", "addons", folder);

const modsStoreDirectory = (appData: string, modId: string) =>
  path.join(appData, "mods", modId, "files");

const OFFLINE_ALPHA_DELETIONS = [
  "pak01_dir.vpk",
  PARKED_VPK,
  "pak05_dir.vpk",
  "pak06_dir.vpk",
];
const OFFLINE_BETA_DELETIONS = ["pak01_dir.vpk"];

const modSchema = z.looseObject({
  remoteId: z.string(),
  status: z.string(),
  installedVpks: z.array(z.string()).optional(),
});
const documentSchema = z.object({
  state: z.looseObject({
    localMods: z.array(modSchema),
    profiles: z.record(
      z.string(),
      z.looseObject({
        mods: z.array(modSchema),
        enabledMods: z.record(z.string(), z.json()),
      }),
    ),
  }),
  version: z.number(),
});
const manifestSchema = z.object({
  version: z.number(),
  mods: z.record(
    z.string(),
    z.looseObject({ currentVpks: z.array(z.string()) }),
  ),
});

const mixAlphaLibrary = async (world: CreatedWorld): Promise<void> => {
  const { roots } = world.configuration;
  const alpha = profileDirectory(roots.game, ALPHA.folder);

  await rename(path.join(alpha, "pak02_dir.vpk"), path.join(alpha, PARKED_VPK));
  await writeFile(
    path.join(alpha, "pak05_dir.vpk"),
    profilePayload(PAIR_SECOND_PAYLOAD),
  );
  const stored = modsStoreDirectory(roots.appData, MISSING.stored);
  await mkdir(stored, { recursive: true });
  await writeFile(
    path.join(stored, STORED_SOURCE),
    profilePayload(MISSING.stored),
  );

  const manifestPath = path.join(alpha, ".dmm.json");
  const manifest = manifestSchema.parse(
    JSON.parse(await readFile(manifestPath, "utf8")),
  );
  manifest.mods[MISSING.parked] = {
    ...manifest.mods[MISSING.parked],
    enabled: false,
    currentVpks: [],
    disabledVpks: [PARKED_VPK],
  };
  manifest.mods[MISSING.pair] = {
    ...manifest.mods[MISSING.pair],
    currentVpks: ["pak04_dir.vpk", "pak05_dir.vpk"],
    originalVpkNames: [`${MISSING.pair}.vpk`, `${PAIR_SECOND_PAYLOAD}.vpk`],
  };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  const document = documentSchema.parse(
    await readPersistedDocument(world.directory),
  );
  const toMixedLibrary = (mod: z.infer<typeof modSchema>) =>
    mod.remoteId === MISSING.parked
      ? { ...mod, status: "downloaded", installedVpks: [] }
      : mod.remoteId === MISSING.pair
        ? { ...mod, installedVpks: ["pak04_dir.vpk", "pak05_dir.vpk"] }
        : mod;
  const { state } = document;
  const alphaProfile = state.profiles[ALPHA.id];
  const { [MISSING.parked]: _parked, ...enabledMods } =
    alphaProfile.enabledMods;
  await writeFile(
    path.join(roots.appData, "state.json"),
    JSON.stringify({
      "local-config": JSON.stringify({
        ...document,
        state: {
          ...state,
          localMods: state.localMods.map(toMixedLibrary),
          profiles: {
            ...state.profiles,
            [ALPHA.id]: {
              ...alphaProfile,
              mods: alphaProfile.mods.map(toMixedLibrary),
              enabledMods,
            },
          },
        },
      }),
    }),
  );
};

const recordInitialInventories = async (world: CreatedWorld) => {
  const { roots } = world.configuration;
  await writeFile(
    path.join(world.artifactsDirectory, "missing-vpks-initial.json"),
    JSON.stringify(
      {
        alpha: await collectFileInventory(
          profileDirectory(roots.game, ALPHA.folder),
        ),
        beta: await collectFileInventory(
          profileDirectory(roots.game, BETA.folder),
        ),
        modsStore: await collectFileInventory(path.join(roots.appData, "mods")),
      },
      null,
      2,
    ),
  );
};

export const prepareMissingVpkWorld = async (
  world: CreatedWorld,
): Promise<void> => {
  await prepareInstalledProfiles(
    world,
    [
      { profile: ALPHA, modIds: [...ALPHA_MISSING_MODS], slots: ALPHA_SLOTS },
      { profile: BETA, modIds: [...BETA_MISSING_MODS] },
    ],
    ALPHA.id,
  );
  await mixAlphaLibrary(world);
  await recordInitialInventories(world);

  if (world.configuration.caseId !== "missing-vpks-offline") return;
  const { game } = world.configuration.roots;
  for (const [folder, files] of [
    [ALPHA.folder, OFFLINE_ALPHA_DELETIONS],
    [BETA.folder, OFFLINE_BETA_DELETIONS],
  ] as const)
    for (const file of files)
      await rm(path.join(profileDirectory(game, folder), file));
};
