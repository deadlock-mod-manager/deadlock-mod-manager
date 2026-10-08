import { writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { contentAuthor, contentMods, contentRoutes } from "./content-fixtures";
import { BULK_UPDATE_FIELDS } from "./gamebanana-fixtures";
import { readPersistedDocument } from "./observations";
import { ALPHA, prepareInstalledProfiles } from "./profile-fixtures";
import type { CreatedWorld } from "./world";

export const legacyLibraryAuthorRoutes = async () => {
  const routes = await contentRoutes();
  return (origin: string) => [
    ...routes(origin).map((route) =>
      route.path === "/apiv11/Mod/Index"
        ? Object.assign(route, {
            body: JSON.stringify({
              _aMetadata: {
                _nRecordCount: 0,
                _nPerpage: 50,
                _bIsComplete: true,
              },
              _aRecords: [],
            }),
          })
        : route,
    ),
    {
      method: "GET",
      path: "/Core/Item/Data",
      query: { "fields[]": BULK_UPDATE_FIELDS },
      status: 200,
      body: JSON.stringify([
        `https://gamebanana.com/mods/${contentMods[0].id}`,
        0,
        [],
      ]),
    },
  ];
};

export const prepareLegacyLibraryAuthorWorld = async (world: CreatedWorld) => {
  const mod = contentMods[0];
  await prepareInstalledProfiles(
    world,
    [{ profile: ALPHA, modIds: [mod.id, "local-no-author"] }],
    ALPHA.id,
  );
  const persisted = z
    .object({ state: z.record(z.string(), z.json()), version: z.number() })
    .parse(await readPersistedDocument(world.directory));
  const mods = z
    .array(z.record(z.string(), z.json()))
    .parse(persisted.state.localMods);
  for (const entry of mods) {
    Object.assign(
      entry,
      entry.remoteId === mod.id
        ? {
            name: mod.name,
            author: contentAuthor.name,
            modAuthorId: null,
            remoteUrl: `https://gamebanana.com/mods/${mod.id}`,
          }
        : { name: "E2E Local Mod", author: "Unknown" },
    );
  }
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
