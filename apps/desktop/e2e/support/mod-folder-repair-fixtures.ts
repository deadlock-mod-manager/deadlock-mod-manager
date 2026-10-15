import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ModStatus } from "../../src/types/mods";
import { readPersistedDocument } from "./observations";
import { ALPHA, prepareProfileWorld, profilePayload } from "./profile-fixtures";
import { preparePresenceCache } from "./settings-fixtures";
import { collectFileInventory, type CreatedWorld } from "./world";

export const REPAIR_MODS = [
  "local-11111111-1111-4111-8111-111111111111",
  "local-22222222-2222-4222-8222-222222222222",
  "local-33333333-3333-4333-8333-333333333333",
];
export const REPAIR_UNTRACKED = [
  "untracked-hud.vpk",
  "871_old-version.vpk",
  "addons2/shard-leftover.vpk",
];
export const REPAIR_LOCAL = `${REPAIR_MODS[2]}_skin.vpk`;
export const REPAIR_CORRUPT_MANIFEST = '{"version":3,"mods":';

const mod = z.looseObject({ remoteId: z.string() });
const disable = (value: z.infer<typeof mod>) =>
  value.remoteId === REPAIR_MODS[2]
    ? { ...value, status: ModStatus.Downloaded, installedVpks: [] }
    : value;

export const prepareModFolderRepairWorld = async (world: CreatedWorld) => {
  await prepareProfileWorld(world, REPAIR_MODS);
  await preparePresenceCache(world);
  const citadel = path.join(world.configuration.roots.game, "game", "citadel");
  const base = path.join(citadel, "addons", ALPHA.folder);
  await rename(path.join(base, "pak03_dir.vpk"), path.join(base, REPAIR_LOCAL));
  for (const file of REPAIR_UNTRACKED) {
    const destination = file.startsWith("addons2/")
      ? path.join(citadel, "addons2", ALPHA.folder, path.basename(file))
      : path.join(base, file);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, profilePayload(file));
  }
  await mkdir(path.join(base, ".dmm-reorder"));
  await writeFile(
    path.join(base, ".dmm-reorder", ".transaction.jsonl"),
    "invalid journal\n",
  );
  await writeFile(
    path.join(base, ".dmm-reorder", "s1__pak04_dir.vpk.pending"),
    profilePayload("staged"),
  );
  await writeFile(path.join(base, ".dmm.json"), REPAIR_CORRUPT_MANIFEST);
  const document = z
    .object({
      state: z.looseObject({
        localMods: z.array(mod),
        profiles: z.record(
          z.string(),
          z.looseObject({
            mods: z.array(mod),
            enabledMods: z.record(
              z.string(),
              z.looseObject({ enabled: z.boolean() }),
            ),
          }),
        ),
      }),
      version: z.number(),
    })
    .parse(await readPersistedDocument(world.directory));
  document.state.localMods = document.state.localMods.map(disable);
  const alpha = document.state.profiles[ALPHA.id];
  alpha.mods = alpha.mods.map(disable);
  alpha.enabledMods[REPAIR_MODS[2]].enabled = false;
  await writeFile(
    path.join(world.configuration.roots.appData, "state.json"),
    JSON.stringify({ "local-config": JSON.stringify(document) }),
  );
  await writeFile(
    path.join(world.artifactsDirectory, "mod-folder-repair-initial.json"),
    JSON.stringify(await collectFileInventory(citadel), null, 2),
  );
};
