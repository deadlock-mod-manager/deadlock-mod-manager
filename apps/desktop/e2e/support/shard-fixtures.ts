import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { prepareInstalledProfiles } from "./profile-fixtures";
import { buildSyntheticVpk } from "./vpk";
import type { CreatedWorld } from "./world";

export const SHARDS = {
  id: "profile_400_shards",
  folder: "profile_400_shards_shards",
  name: "E2E Shards",
};

// Local mod identities are UUIDs; disabled copies are matched back to them by
// that prefix, so a made-up ID would show up as an unrecognized file.
export const shardModId = (index: number) =>
  `local-00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

// One more than a single addon folder holds puts the last two mods in addons2.
export const LIBRARY_MODS = Array.from({ length: 101 }, (_, index) =>
  shardModId(index),
);
// Exactly one mod overflows, so both conflicting mods sit in `pak01_dir.vpk`
// and only their shard decides which loads first.
export const CONFLICT_MODS = LIBRARY_MODS.slice(0, 100);
export const SHARD_ONE_WINNER = shardModId(0);
export const OVERFLOW_CHALLENGER = shardModId(99);

const isConflictCase = (caseId: string) => caseId === "shards-conflicts";

export const shardPayload =
  (caseId: string) =>
  (modId: string): Buffer =>
    buildSyntheticVpk([
      {
        path: `scripts/shards/${modId}.txt`,
        contents: `Distinct payload for ${modId}\n`,
      },
      ...(isConflictCase(caseId) &&
      (modId === SHARD_ONE_WINNER || modId === OVERFLOW_CHALLENGER)
        ? [
            {
              path: "models/shards/hat.vmdl_c",
              contents: `hat from ${modId}\n`,
            },
          ]
        : []),
    ]);

export const shardMods = (caseId: string) =>
  isConflictCase(caseId) ? CONFLICT_MODS : LIBRARY_MODS;

export const prepareShardWorld = async (world: CreatedWorld): Promise<void> => {
  const caseId = world.configuration.caseId;
  await prepareInstalledProfiles(
    world,
    [
      {
        profile: SHARDS,
        modIds: shardMods(caseId),
        payload: shardPayload(caseId),
      },
    ],
    SHARDS.id,
  );
  // Shard status lives on the developer page.
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
        state: { ...persisted.state, developerMode: true },
      }),
    }),
  );
};
