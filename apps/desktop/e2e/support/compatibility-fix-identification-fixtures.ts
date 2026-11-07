import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prepareInstalledProfiles } from "./profile-fixtures";
import { buildSyntheticVpk } from "./vpk";
import type { CreatedWorld } from "./world";

// A hand-added mod the player fixed, which Analyze then identifies as the
// catalog mod `detectedModRoutes` answers with.

export const IDENTIFY = {
  id: "profile_430_identify",
  folder: "profile_430_identify_identify",
  name: "E2E Identify",
};

/** Fixable: its copy of a game text file lacks a game token. */
export const PLACEHOLDER_MOD = "local-identify-text";

const TEXT_FILE = "resource/localization/e2e_identify/e2e_identify_english.txt";

const localization = (tokens: Record<string, string>) =>
  `"lang"\n{\n\t"Language"\t\t"English"\n\t"Tokens"\n\t{\n${Object.entries(
    tokens,
  )
    .map(([token, text]) => `\t\t"${token}"\t\t"${text}"\n`)
    .join("")}\t}\n}\n`;

export const prepareIdentifiedFixWorld = async (
  world: CreatedWorld,
): Promise<void> => {
  const citadel = path.join(world.configuration.roots.game, "game", "citadel");
  await writeFile(
    path.join(citadel, "steam.inf"),
    "ClientVersion=7000\nServerVersion=7000\n",
  );
  const text = path.join(citadel, TEXT_FILE);
  await mkdir(path.dirname(text), { recursive: true });
  await writeFile(
    text,
    localization({ e2e_kept: "Kept", e2e_new: "New game text" }),
  );
  await prepareInstalledProfiles(
    world,
    [
      {
        profile: IDENTIFY,
        modIds: [PLACEHOLDER_MOD],
        payload: () =>
          buildSyntheticVpk([
            {
              path: TEXT_FILE,
              contents: localization({ e2e_kept: "Kept" }),
            },
          ]),
      },
    ],
    IDENTIFY.id,
  );
};
