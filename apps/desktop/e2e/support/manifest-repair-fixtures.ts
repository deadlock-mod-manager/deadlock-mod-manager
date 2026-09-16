import { readPersistedDocument } from "./observations";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ALPHA, prepareProfileWorld } from "./profile-fixtures";
import type { CreatedWorld } from "./world";

const modSchema = z.looseObject({ remoteId: z.string(), status: z.string() });
const documentSchema = z.object({
  state: z.looseObject({
    localMods: z.array(modSchema),
    profiles: z.record(z.string(), z.looseObject({ mods: z.array(modSchema) })),
  }),
  version: z.number(),
});

/**
 * A store that arrived from a build which tracked installed files itself: the
 * mods are still enabled in the profile and their VPKs are still on disk under
 * the manifest, but the mirrored install state claims an unfinished download.
 */
const withoutInstallState = (mod: z.infer<typeof modSchema>) => {
  const { installedVpks: _vpks, installedFileTree: _tree, ...rest } = mod;
  return { ...rest, status: "downloading" };
};

export const prepareManifestRepairWorld = async (
  world: CreatedWorld,
): Promise<void> => {
  await prepareProfileWorld(world);
  const document = documentSchema.parse(
    await readPersistedDocument(world.directory),
  );
  const { state } = document;
  await writeFile(
    path.join(world.configuration.roots.appData, "state.json"),
    JSON.stringify({
      "local-config": JSON.stringify({
        ...document,
        state: {
          ...state,
          localMods: state.localMods.map(withoutInstallState),
          profiles: {
            ...state.profiles,
            [ALPHA.id]: {
              ...state.profiles[ALPHA.id],
              mods: state.profiles[ALPHA.id].mods.map(withoutInstallState),
            },
          },
        },
      }),
    }),
  );
};
