import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { fingerprint, readPersistedDocument } from "./observations";
import { ALPHA, prepareInstalledProfiles } from "./profile-fixtures";
import { buildSyntheticVpk } from "./vpk";
import { assertOwnedWorld, type CreatedWorld } from "./world";

const FOUNDRY_MOD_ID = "local-foundry-kelvin";
export const FOUNDRY_MOD_NAME = "E2E Foundry Kelvin";
export const FOUNDRY_TEXTURE =
  "materials/models/heroes/kelvin/body_color.vtex_c";
export const FOUNDRY_MATERIAL = "materials/models/heroes/kelvin/body.vmat_c";
export const WORKSPACE_FAILURE =
  "Couldn’t prepare this skin for editing. You can still preview it. Retry to edit and export.";

// One compiled resource with a DATA block. Source2-model's Resource reader uses
// offsets relative to the block's offset field, not the start of the file.
const resource = (data: Buffer, trailing = Buffer.alloc(0)): Buffer => {
  const header = Buffer.alloc(28);
  header.writeUInt32LE(header.length + data.length, 0);
  header.writeUInt16LE(12, 4);
  header.writeUInt16LE(1, 6);
  header.writeUInt32LE(8, 8);
  header.writeUInt32LE(1, 12);
  header.write("DATA", 16);
  header.writeUInt32LE(8, 20);
  header.writeUInt32LE(data.length, 24);
  return Buffer.concat([header, data, trailing]);
};

export const foundryTextureBytes = (): Buffer => {
  const data = Buffer.alloc(40);
  data.writeUInt16LE(1, 0);
  data.writeUInt16LE(2, 20);
  data.writeUInt16LE(2, 22);
  data.writeUInt16LE(1, 24);
  data[26] = 4; // RGBA8888, one uncompressed mip.
  data[27] = 1;
  return resource(
    data,
    Buffer.from(Array.from({ length: 4 }, () => [220, 30, 20, 255]).flat()),
  );
};

export const foundryMaterialBytes = (shader = "pbr.vfx"): Buffer => {
  // Uncompressed KV3 v1: { m_shaderName, m_textureParams: [{ m_name, m_pValue }] }.
  // The value, string and type streams follow source2-model's KV3 reader.
  const strings = [
    "m_shaderName",
    shader,
    "m_textureParams",
    "m_name",
    "g_tColor",
    "m_pValue",
    FOUNDRY_TEXTURE.replace(/_c$/, ""),
  ];
  const values = [strings.length, 2, 0, 1, 2, 1, 2, 3, 4, 5, 6];
  const stream = Buffer.alloc(48);
  values.forEach((value, i) => stream.writeInt32LE(value, i * 4));
  const payload = Buffer.concat([
    stream,
    Buffer.from(`${strings.join("\0")}\0`),
    Buffer.from([9, 6, 8, 9, 6, 6]),
    Buffer.from([0, 0xdd, 0xee, 0xff]),
  ]);
  const header = Buffer.alloc(40);
  header.writeUInt32LE(0x4b563301, 0);
  header.writeUInt32LE(values.length, 28);
  header.writeUInt32LE(payload.length, 36);
  return resource(Buffer.concat([header, payload]));
};

const foundryVpkBytes = (): Buffer =>
  buildSyntheticVpk([
    { path: FOUNDRY_MATERIAL, contents: foundryMaterialBytes() },
    { path: FOUNDRY_TEXTURE, contents: foundryTextureBytes() },
  ]);

export const prepareFoundryWorld = async (world: CreatedWorld) => {
  await prepareInstalledProfiles(
    world,
    [
      {
        profile: ALPHA,
        modIds: [FOUNDRY_MOD_ID],
        payload: foundryVpkBytes,
      },
    ],
    ALPHA.id,
  );
  const persisted = z
    .object({
      state: z.record(z.string(), z.json()),
      version: z.number(),
    })
    .parse(await readPersistedDocument(world.directory));
  const mods = z
    .array(z.object({ remoteId: z.string() }).catchall(z.json()))
    .parse(persisted.state.localMods)
    .map((mod) =>
      Object.assign(mod, {
        name: FOUNDRY_MOD_NAME,
        hero: "Kelvin",
        detectedHero: "Kelvin",
      }),
    );
  const profiles = z
    .record(z.string(), z.record(z.string(), z.json()))
    .parse(persisted.state.profiles);
  profiles[ALPHA.id] = { ...profiles[ALPHA.id], mods };
  persisted.state = {
    ...persisted.state,
    profiles,
    localMods: mods,
    foundry3dPreviewEnabled: false,
  };
  await writeFile(
    path.join(world.configuration.roots.appData, "state.json"),
    JSON.stringify({ "local-config": JSON.stringify(persisted) }),
  );
  if (world.configuration.caseId === "foundry-workspace-failure") {
    await writeFile(
      path.join(world.configuration.roots.appData, "foundry"),
      "E2E workspace obstruction\n",
    );
  }
};

export const foundryWorkspaceRoot = async (world: string): Promise<string> => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  const directory = path.join(roots.appData, "foundry");
  const entries = await readdir(directory, { withFileTypes: true });
  assert.equal(entries.length, 1, "Exactly one Foundry workspace must exist");
  const entry = entries[0];
  assert.ok(entry?.isDirectory());
  return path.join(directory, entry.name);
};

export const foundryStagedSource = async (world: string): Promise<string> => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  const staging = path.join(
    roots.temporary,
    "deadlock-mod-manager",
    "foundry-staged-vpk",
  );
  const entries = await readdir(staging, { withFileTypes: true });
  const matches: string[] = [];
  for (const entry of entries.filter((item) => item.isDirectory())) {
    const candidate = path.join(staging, entry.name, "pak01_dir.vpk");
    if ((await readFile(candidate)).equals(foundryVpkBytes()))
      matches.push(candidate);
  }
  assert.equal(
    matches.length,
    1,
    "Identify the staged skin by its exact bytes",
  );
  return z.string().parse(matches[0]);
};

const readJournal = async (root: string, name: string) => {
  try {
    return z
      .json()
      .parse(JSON.parse(await readFile(path.join(root, name), "utf8")));
  } catch (error) {
    // Fresh workspaces have no journals until their first edit completes.
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return [];
    throw error;
  }
};

export const readFoundryJournals = async (root: string) => ({
  edits: z.array(z.string()).parse(await readJournal(root, "edits.json")),
  paint: z
    .array(z.object({ entryPath: z.string() }).catchall(z.json()))
    .parse(await readJournal(root, "paint.json")),
});

export const assertFoundryDisk = async (world: string, checkpoint: string) => {
  const {
    configuration: { roots },
  } = await assertOwnedWorld(world);
  const root = await foundryWorkspaceRoot(world);
  const texture = await readFile(path.join(root, "files", FOUNDRY_TEXTURE));
  const material = await readFile(path.join(root, "files", FOUNDRY_MATERIAL));
  assert.deepEqual(
    texture,
    foundryTextureBytes(),
    "Revert restores the exact packed texture",
  );
  assert.deepEqual(
    material,
    foundryMaterialBytes(),
    "The material remains unchanged",
  );
  const journal = await readFoundryJournals(root);
  assert.deepEqual(journal, { edits: [], paint: [] });
  const addons = path.join(
    roots.game,
    "game",
    "citadel",
    "addons",
    ALPHA.folder,
  );
  assert.deepEqual(
    await readFile(path.join(addons, "pak01_dir.vpk")),
    foundryVpkBytes(),
  );
  const manifest = z
    .object({
      mods: z.record(
        z.string(),
        z.object({
          enabled: z.boolean(),
          currentVpks: z.array(z.string()),
        }),
      ),
    })
    .parse(JSON.parse(await readFile(path.join(addons, ".dmm.json"), "utf8")));
  assert.deepEqual(manifest.mods, {
    [FOUNDRY_MOD_ID]: { enabled: true, currentVpks: ["pak01_dir.vpk"] },
  });
  const persisted = z
    .object({
      state: z.object({
        foundry3dPreviewEnabled: z.literal(false),
        localMods: z.array(
          z.object({
            remoteId: z.string(),
            status: z.literal("installed"),
            installedVpks: z.array(z.string()),
          }),
        ),
      }),
    })
    .parse(await readPersistedDocument(world));
  assert.deepEqual(persisted.state.localMods, [
    {
      remoteId: FOUNDRY_MOD_ID,
      status: "installed",
      installedVpks: ["pak01_dir.vpk"],
    },
  ]);
  await writeFile(
    path.join(world, "artifacts", `foundry-${checkpoint}.json`),
    JSON.stringify(
      {
        journal,
        manifest,
        state: persisted.state,
        texture: fingerprint(texture),
        material: fingerprint(material),
      },
      null,
      2,
    ),
  );
};
