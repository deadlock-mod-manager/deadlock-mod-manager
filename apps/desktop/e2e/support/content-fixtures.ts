import { writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { FixtureRoute } from "./fixture-server";
import type { CreatedWorld } from "./world";
import { prepareInstalledProfiles, ALPHA } from "./profile-fixtures";
import { readPersistedDocument } from "./observations";

export const contentMods = [
  { id: "920001", name: "E2E Safe Skin", nsfw: false },
  { id: "920002", name: "E2E Adult Skin", nsfw: true },
];
const heroNames = [
  "Abrams",
  "Apollo",
  "Bebop",
  "Billy",
  "Calico",
  "Celeste",
  "Doorman",
  "Drifter",
  "Dynamo",
  "Graves",
  "Grey Talon",
  "Haze",
  "Holliday",
  "Infernus",
  "Ivy",
  "Kelvin",
  "Lady Geist",
  "Lash",
  "McGinnis",
  "Mina",
  "Mirage",
  "Mo & Krill",
  "Paige",
  "Paradox",
  "Pocket",
  "Rem",
  "Seven",
  "Shiv",
  "Silver",
  "Sinclair",
  "Venator",
  "Victor",
  "Vindicta",
  "Viscous",
  "Vyper",
  "Warden",
  "Wraith",
  "Wrecker",
  "Yamato",
];
export const contentRoutes =
  async () =>
  (origin: string): FixtureRoute[] => {
    const profiles = contentMods.map((mod) => ({
      _idRow: Number(mod.id),
      _sModelName: "Mod",
      _sName: mod.name,
      _sProfileUrl: `https://gamebanana.com/mods/${mod.id}`,
      _tsDateAdded: 1780000000,
      _tsDateModified: 1780000000,
      _bHasFiles: true,
      _sText: "Synthetic content filter fixture",
      _aSubmitter: { _sName: "E2E" },
      _aRootCategory: { _sName: "Skins" },
      _aCategory: { _sName: "Infernus" },
      _aContentRatings: mod.nsfw ? { st: "Synthetic rating" } : {},
      _aPreviewMedia: {
        _aImages: [{ _sBaseUrl: `${origin}/images`, _sFile: `${mod.id}.svg` }],
      },
      _aFiles: [],
    }));
    const json = (path: string, body: object): FixtureRoute => ({
      method: "GET",
      path,
      status: 200,
      body: JSON.stringify(body),
    });
    return [
      ...heroNames.map((name, index) =>
        json(`/v2/heroes/by-name/${encodeURIComponent(name)}`, {
          id: index + 1,
          name,
          class_name: `hero_${name.toLowerCase()}`,
          images: { icon_hero_card: `${origin}/images/920001.svg` },
        }),
      ),
      json("/api/v2/feature-flags", [
        { name: "profile-management", enabled: true },
      ]),
      json("/apiv11/Mod/Index", {
        _aMetadata: {
          _nRecordCount: profiles.length,
          _nPerpage: 50,
          _bIsComplete: true,
        },
        _aRecords: profiles,
      }),
      {
        ...json(
          "/apiv11/Core/Item/Data",
          contentMods.map((mod) => [
            mod.name,
            0,
            "Infernus",
            "Skins",
            mod.nsfw,
            "Synthetic fixture",
            "Synthetic fixture",
          ]),
        ),
        query: { "fields[]": "name" },
      },
      json("/apiv11/Util/Fileservers", { _aRecords: [] }),
      ...profiles.flatMap((profile) => [
        json(`/apiv11/Mod/${profile._idRow}/ProfilePage`, profile),
        json(`/apiv11/Mod/${profile._idRow}/DownloadPage`, { _aFiles: [] }),
        json(`/api/v2/reports/mod/${profile._idRow}/counts`, {
          total: 0,
          open: 0,
          resolved: 0,
          dismissed: 0,
        }),
        {
          method: "GET",
          path: `/images/${profile._idRow}.svg`,
          status: 200,
          headers: { "content-type": "image/svg+xml" },
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#547090"/></svg>',
        },
      ]),
    ];
  };

export const prepareContentWorld = async (
  world: CreatedWorld,
  origin: string,
) => {
  await prepareInstalledProfiles(
    world,
    [{ profile: ALPHA, modIds: ["local-safe-skin", "local-adult-skin"] }],
    ALPHA.id,
  );
  const persisted = z
    .object({ state: z.record(z.string(), z.json()), version: z.number() })
    .parse(await readPersistedDocument(world.directory));
  const mods = z
    .array(z.record(z.string(), z.json()))
    .parse(persisted.state.localMods)
    .map((mod, index) => ({
      ...mod,
      name: index === 0 ? "E2E Local Safe Skin" : "E2E Local Adult Skin",
      isNSFW: index === 1,
      hero: "Infernus",
      detectedHero: "Infernus",
      images: [`${origin}/images/${contentMods[index].id}.svg`],
    }));
  const profiles = z
    .record(z.string(), z.record(z.string(), z.json()))
    .parse(persisted.state.profiles);
  profiles[ALPHA.id] = { ...profiles[ALPHA.id], mods };
  persisted.state = {
    ...persisted.state,
    localMods: mods,
    profiles,
    foundry3dPreviewEnabled: false,
    nsfwSettings: {
      hideNSFW: false,
      disableBlur: false,
      blurStrength: 16,
      showLikelyNSFW: false,
      rememberPerItemOverrides: true,
    },
  };
  await writeFile(
    path.join(world.configuration.roots.appData, "state.json"),
    JSON.stringify({ "local-config": JSON.stringify(persisted) }),
  );
};
