import { writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { readPersistedDocument } from "./observations";
import { writeSyntheticVpk } from "./vpk";
import type { CreatedWorld } from "./world";

export const prepareOnboardingWorld = async (world: CreatedWorld) => {
  const persisted = z
    .object({ state: z.record(z.string(), z.json()), version: z.number() })
    .parse(await readPersistedDocument(world.directory));
  persisted.state.hasCompletedOnboarding = false;
  await writeFile(
    path.join(world.configuration.roots.appData, "state.json"),
    JSON.stringify({ "local-config": JSON.stringify(persisted) }),
  );
  await writeSyntheticVpk(
    path.join(
      world.configuration.roots.game,
      "game",
      "citadel",
      "addons",
      "pak01_dir.vpk",
    ),
    [
      {
        path: "scripts/e2e-onboarding.txt",
        contents: "Existing addon for onboarding analysis",
      },
    ],
  );
};
