import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { assertOwnedWorld } from "./world";

export const seedPendingLocalName = async (world: string) => {
  const { modId } = z
    .object({ modId: z.string() })
    .parse(
      JSON.parse(
        await readFile(
          path.join(world, "artifacts", "lifecycle-checkpoint.json"),
          "utf8",
        ),
      ),
    );
  const { configuration } = await assertOwnedWorld(world);
  const storePath = path.join(configuration.roots.appData, "state.json");
  const store = z
    .looseObject({ "local-config": z.string() })
    .parse(JSON.parse(await readFile(storePath, "utf8")));
  const modSchema = z.looseObject({ remoteId: z.string() });
  const document = z
    .looseObject({
      state: z.looseObject({
        localMods: z.array(modSchema),
        profiles: z.record(
          z.string(),
          z.looseObject({ mods: z.array(modSchema) }),
        ),
      }),
    })
    .parse(JSON.parse(store["local-config"]));
  const markPending = (mod: z.infer<typeof modSchema>) =>
    mod.remoteId === modId
      ? { ...mod, name: modId, metadataPending: true }
      : mod;
  document.state.localMods = document.state.localMods.map(markPending);
  for (const profile of Object.values(document.state.profiles)) {
    profile.mods = profile.mods.map(markPending);
  }
  store["local-config"] = JSON.stringify(document);
  await writeFile(storePath, JSON.stringify(store));
};
