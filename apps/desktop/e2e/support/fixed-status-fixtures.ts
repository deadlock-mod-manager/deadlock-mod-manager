import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prepareInstalledProfiles } from "./profile-fixtures";
import { buildSyntheticVpk, localizationText } from "./vpk";
import type { CreatedWorld } from "./world";

export const STATUS = {
  id: "profile_410_status",
  folder: "profile_410_status_status",
  name: "E2E Status",
};

const OTHER_STATUS = {
  id: "profile_420_other",
  folder: "profile_420_other_other",
  name: "E2E Other",
};

export const FIXED_MOD = "local-status-text";
export const RIVAL_MOD = "local-status-rival";
const SECOND_MOD = "local-status-second";
export const PLAIN_MOD = "local-status-plain";
const OTHER_DATA_MOD = "local-status-other-data";
export const DATA_MOD_FILE = "local-status-data.vpk";

export const GAME_BUILD = 7000;
const DATA_TABLE = "scripts/e2e_status.vdata_c";

const DATA_TABLE_HEX =
  "eb0000000c0000000800000001000000444154410c000000cb000000000000000433564b000000000000000000000000000000000000000000000000000000000e0000000200000037000000000000008300000083000000000000000000000000000000000000000500000004000000000000000100000001000000020000000100000001000000030000000100000001000000040000000100000001000000020000000000000003000000000000006532655f726f775f300076616c7565006532655f726f775f31006532655f726f775f32006532655f726f775f330009090f09100903090300ddeeff";
const dataTableBytes = (): Buffer => Buffer.from(DATA_TABLE_HEX, "hex");

export const TEXT_FILE =
  "resource/localization/e2e_status/e2e_status_english.txt";

const SECOND_TEXT_FILE =
  "resource/localization/e2e_second/e2e_second_english.txt";

const GAME_TEXT = {
  e2e_kept: "Kept",
  e2e_new: "New game text",
  e2e_name: "Game name",
};

const textMod = (name: string) =>
  buildSyntheticVpk([
    {
      path: TEXT_FILE,
      contents: localizationText({ e2e_kept: "Kept", e2e_name: name }),
    },
  ]);

const plainMod = (modId: string) =>
  buildSyntheticVpk([
    { path: "models/outfit/status_hat.vmdl_c", contents: `${modId} hat\n` },
  ]);

const dataMod = () =>
  buildSyntheticVpk([{ path: DATA_TABLE, contents: dataTableBytes() }]);

const PAYLOADS = new Map<string, () => Buffer>([
  [FIXED_MOD, () => textMod("Fixed name")],
  [RIVAL_MOD, () => textMod("Rival name")],
  [
    SECOND_MOD,
    () =>
      buildSyntheticVpk([
        {
          path: SECOND_TEXT_FILE,
          contents: localizationText({
            e2e_kept: "Kept",
            e2e_name: "Second name",
          }),
        },
      ]),
  ],
  [PLAIN_MOD, () => plainMod(PLAIN_MOD)],
  [OTHER_DATA_MOD, dataMod],
]);

const payload = (modId: string): Buffer => {
  const build = PAYLOADS.get(modId);
  if (!build) throw new Error(`No fixed-status payload for ${modId}`);
  return build();
};

export const prepareFixedStatusWorld = async (
  world: CreatedWorld,
  modIds: readonly string[],
  otherModIds: readonly string[] = [],
): Promise<void> => {
  const citadel = path.join(world.configuration.roots.game, "game", "citadel");
  await writeFile(
    path.join(citadel, "steam.inf"),
    `ClientVersion=${GAME_BUILD}\nServerVersion=${GAME_BUILD}\n`,
  );
  for (const file of [TEXT_FILE, SECOND_TEXT_FILE]) {
    const text = path.join(citadel, file);
    await mkdir(path.dirname(text), { recursive: true });
    await writeFile(text, localizationText(GAME_TEXT));
  }
  await writeFile(
    path.join(citadel, "pak01_dir.vpk"),
    buildSyntheticVpk([{ path: DATA_TABLE, contents: dataTableBytes() }]),
  );
  await prepareInstalledProfiles(
    world,
    [
      { profile: STATUS, modIds: [...modIds], payload },
      ...(otherModIds.length > 0
        ? [{ profile: OTHER_STATUS, modIds: [...otherModIds], payload }]
        : []),
    ],
    STATUS.id,
  );
  const fixtures = path.join(world.directory, "fixtures");
  await mkdir(fixtures, { recursive: true });
  await writeFile(path.join(fixtures, DATA_MOD_FILE), dataMod());
};
