import { writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { ModFileTree } from "../../src/types/mods";
import { readPersistedDocument } from "./observations";
import { ALPHA, prepareInstalledProfiles } from "./profile-fixtures";
import type { CreatedWorld } from "./world";

/**
 * One Grey Talon skin split across two archives, both switched on, next to two
 * Haze skins that are genuinely on together. Only Haze is in conflict.
 */
export const heroSkinMods = {
  talon: { id: "local-talon-archer", name: "E2E Talon Archer" },
  hazeOne: { id: "local-haze-one", name: "E2E Haze One" },
  hazeTwo: { id: "local-haze-two", name: "E2E Haze Two" },
};
const talonArchives = ["gt_archer_model.zip", "gt_archer_sounds.zip"];

const talonVariant = {
  installedFileTree: {
    files: talonArchives.map((archive, index) => ({
      name: `pak0${index + 1}_dir.vpk`,
      path: `pak0${index + 1}_dir.vpk`,
      size: 1024,
      is_selected: true,
      archive_name: archive,
    })),
    total_files: talonArchives.length,
    has_multiple_files: true,
  } satisfies ModFileTree,
  activeVariantArchive: talonArchives.join(","),
};

export const prepareHeroSkinsWorld = async (world: CreatedWorld) => {
  const { talon, hazeOne, hazeTwo } = heroSkinMods;
  await prepareInstalledProfiles(
    world,
    [{ profile: ALPHA, modIds: [talon.id, hazeOne.id, hazeTwo.id] }],
    ALPHA.id,
  );
  const persisted = z
    .object({ state: z.record(z.string(), z.json()), version: z.number() })
    .parse(await readPersistedDocument(world.directory));
  const fixtures = new Map(
    Object.values(heroSkinMods).map((mod) => [mod.id, mod]),
  );
  const mods = z
    .array(z.object({ remoteId: z.string() }).catchall(z.json()))
    .parse(persisted.state.localMods)
    .map((mod) => {
      const hero = mod.remoteId === talon.id ? "Grey Talon" : "Haze";
      const named = {
        ...mod,
        name: fixtures.get(mod.remoteId)?.name ?? mod.remoteId,
        hero,
        detectedHero: hero,
      };
      return mod.remoteId === talon.id ? { ...named, ...talonVariant } : named;
    });
  const profiles = z
    .record(z.string(), z.record(z.string(), z.json()))
    .parse(persisted.state.profiles);
  profiles[ALPHA.id] = { ...profiles[ALPHA.id], mods };
  persisted.state = {
    ...persisted.state,
    localMods: mods,
    profiles,
    foundry3dPreviewEnabled: false,
  };
  await writeFile(
    path.join(world.configuration.roots.appData, "state.json"),
    JSON.stringify({ "local-config": JSON.stringify(persisted) }),
  );
};
