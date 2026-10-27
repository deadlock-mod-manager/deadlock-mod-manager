import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { readPersistedDocument } from "./observations";
import { ALPHA, prepareInstalledProfiles } from "./profile-fixtures";
import { buildSyntheticVpk } from "./vpk";
import type { CreatedWorld } from "./world";

export const MULTI = {
  id: "local-file-order",
  files: ["first.vpk", "second.vpk"],
};
export const SOLO = { id: "local-file-order-solo", file: "solo.vpk" };

export const filePayload = (name: string): Buffer =>
  buildSyntheticVpk([
    {
      path: "scripts/file-order-fixture.txt",
      contents: `Distinct payload for ${name}\n`,
    },
  ]);

/**
 * Alpha holds a two-file mod in pak01 and pak02, then a one-file mod in pak03.
 * The two-file mod carries a file tree in author order, as GameBanana mods do.
 */
export const prepareFileOrderWorld = async (world: CreatedWorld) => {
  await prepareInstalledProfiles(
    world,
    [
      {
        profile: ALPHA,
        modIds: [MULTI.id, SOLO.id],
        slots: [1, 3],
        payload: (modId) =>
          filePayload(modId === MULTI.id ? MULTI.files[0] : SOLO.file),
      },
    ],
    ALPHA.id,
  );
  const directory = path.join(
    world.configuration.roots.game,
    "game",
    "citadel",
    "addons",
    ALPHA.folder,
  );
  await writeFile(
    path.join(directory, "pak02_dir.vpk"),
    filePayload(MULTI.files[1]),
  );
  const manifestPath = path.join(directory, ".dmm.json");
  const manifest = z
    .object({
      version: z.literal(3),
      mods: z.record(
        z.string(),
        z
          .object({
            currentVpks: z.array(z.string()),
            originalVpkNames: z.array(z.string()),
          })
          .loose(),
      ),
    })
    .parse(JSON.parse(await readFile(manifestPath, "utf8")));
  manifest.mods[MULTI.id].currentVpks = ["pak01_dir.vpk", "pak02_dir.vpk"];
  manifest.mods[MULTI.id].originalVpkNames = MULTI.files;
  manifest.mods[SOLO.id].originalVpkNames = [SOLO.file];
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  const storedMod = z.object({ remoteId: z.string() }).loose();
  const persisted = z
    .object({
      state: z
        .object({
          localMods: z.array(storedMod),
          profiles: z.record(
            z.string(),
            z.object({ mods: z.array(storedMod) }).loose(),
          ),
        })
        .loose(),
      version: z.number(),
    })
    .parse(await readPersistedDocument(world.directory));
  const alpha = persisted.state.profiles[ALPHA.id];
  alpha.mods = alpha.mods.map((mod) =>
    mod.remoteId === MULTI.id
      ? {
          ...mod,
          installedVpks: ["pak01_dir.vpk", "pak02_dir.vpk"],
          installedFileTree: {
            files: MULTI.files.map((name) => ({
              name,
              path: name,
              size: 0,
              is_selected: true,
              archive_name: "",
            })),
            total_files: MULTI.files.length,
            has_multiple_files: true,
          },
        }
      : mod,
  );
  persisted.state.localMods = alpha.mods;
  await writeFile(
    path.join(world.configuration.roots.appData, "state.json"),
    JSON.stringify({ "local-config": JSON.stringify(persisted) }),
  );
};
