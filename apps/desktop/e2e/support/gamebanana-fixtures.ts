import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import type { FixtureRequest, FixtureRoute } from "./fixture-server";
import { buildSyntheticVpk } from "./vpk";

export const CATALOG_MOD_ID = "900001";
export const CATALOG_MOD_NAME = "E2E GameBanana Mod";
const timestamp = 1_780_000_000;

export const catalogRecipe = (scenario: string) => {
  if (scenario === "gamebanana-single")
    return [
      { id: 910001, name: "base.zip", files: ["base.vpk"], selected: true },
    ];
  if (scenario === "gamebanana-multifile")
    return [
      { id: 910001, name: "base.zip", files: ["base.vpk"], selected: true },
      {
        id: 910002,
        name: "effects.zip",
        files: ["effects.vpk"],
        selected: true,
      },
      {
        id: 910003,
        name: "alternate.zip",
        files: ["alternate.vpk"],
        selected: false,
      },
    ];
  if (scenario === "gamebanana-variants")
    return [
      {
        id: 910001,
        name: "variants.zip",
        files: ["common.vpk", "blue.vpk", "red.vpk"],
        selected: true,
      },
    ];
  throw new Error(`Unsupported catalog scenario '${scenario}'`);
};

export const catalogVpk = (name: string): Buffer =>
  buildSyntheticVpk([
    {
      path: "scripts/e2e-catalog.txt",
      contents: `GameBanana fixture: ${name}\n`,
    },
  ]);

export const installedCatalogFiles = (scenario: string): string[] =>
  catalogRecipe(scenario)
    .filter((archive) => archive.selected)
    .flatMap((archive) => archive.files)
    .filter((name) => name !== "red.vpk")
    .sort();

export const createCatalogRoutes = async (scenario: string) => {
  const archives = await Promise.all(
    catalogRecipe(scenario).map(async (recipe) => {
      const zip = new JSZip();
      for (const name of recipe.files)
        zip.file(name, catalogVpk(name), {
          date: new Date("2020-01-01T00:00:00Z"),
        });
      return {
        ...recipe,
        body: await zip.generateAsync({
          type: "nodebuffer",
          compression: "STORE",
        }),
      };
    }),
  );
  return (origin: string): FixtureRoute[] => {
    const files = archives.map((archive) => ({
      _idRow: archive.id,
      _sFile: archive.name,
      _nFilesize: archive.body.length,
      _sDownloadUrl: `${origin}/dl/${archive.id}`,
      _tsDateAdded: timestamp,
      _sMd5Checksum: createHash("md5").update(archive.body).digest("hex"),
    }));
    const profile = {
      _idRow: Number(CATALOG_MOD_ID),
      _sModelName: "Mod",
      _sName: CATALOG_MOD_NAME,
      _sProfileUrl: `https://gamebanana.com/mods/${CATALOG_MOD_ID}`,
      _tsDateAdded: timestamp,
      _tsDateModified: timestamp,
      _bHasFiles: true,
      _aSubmitter: { _sName: "E2E Author" },
      _aRootCategory: { _sName: "Skins" },
      _aCategory: { _sName: "Skins" },
      _sText: "Synthetic catalog installation fixture.",
      _aFiles: files,
    };
    const json = (path: string, body: string): FixtureRoute => ({
      method: "GET",
      path,
      status: 200,
      body,
    });
    return [
      json(
        "/apiv11/Mod/Index",
        JSON.stringify({
          _aMetadata: { _nRecordCount: 1, _nPerpage: 50, _bIsComplete: true },
          _aRecords: [profile],
        }),
      ),
      json(
        `/apiv11/Mod/${CATALOG_MOD_ID}/ProfilePage`,
        JSON.stringify(profile),
      ),
      json(
        `/apiv11/Mod/${CATALOG_MOD_ID}/DownloadPage`,
        JSON.stringify({ _aFiles: files }),
      ),
      {
        ...json(
          "/apiv11/Core/Item/Data",
          JSON.stringify([
            [
              CATALOG_MOD_NAME,
              0,
              "Skins",
              "Skins",
              false,
              profile._sText,
              profile._sText,
            ],
          ]),
        ),
        query: { "fields[]": "name" },
      },
      {
        ...json(
          "/apiv11/Core/Item/Data",
          JSON.stringify([profile._sProfileUrl, timestamp, files]),
        ),
        query: { "fields[]": "Url().sProfileUrl()" },
      },
      json("/apiv11/Util/Fileservers", '{"_aRecords":[]}'),
      json(
        `/api/v2/reports/mod/${CATALOG_MOD_ID}/counts`,
        '{"total":0,"open":0,"resolved":0,"dismissed":0}',
      ),
      ...archives
        .filter((archive) => archive.selected)
        .map((archive) => ({
          method: "GET",
          path: `/dl/${archive.id}`,
          status: 200,
          body: archive.body,
        })),
    ];
  };
};

export const assertCatalogNetwork = (
  scenario: string,
  requests: readonly FixtureRequest[],
): void => {
  assert.deepEqual(
    requests
      .filter((request) => request.url.startsWith("/dl/"))
      .map((request) => ({ path: request.url, status: request.responseStatus }))
      .sort((a, b) => a.path.localeCompare(b.path)),
    catalogRecipe(scenario)
      .filter((archive) => archive.selected)
      .map((archive) => ({ path: `/dl/${archive.id}`, status: 200 })),
  );
  for (const endpoint of [
    "/apiv11/Mod/Index",
    `/apiv11/Mod/${CATALOG_MOD_ID}/ProfilePage`,
    `/apiv11/Mod/${CATALOG_MOD_ID}/DownloadPage`,
  ])
    assert(
      requests.some(
        (request) =>
          request.url.split("?")[0] === endpoint &&
          request.responseStatus === 200,
      ),
      `Missing real provider request: ${endpoint}`,
    );
};
