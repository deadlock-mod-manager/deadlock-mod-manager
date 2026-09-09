import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createArchive } from "./archive-fixtures";
import type { FixtureRequest, FixtureRoute } from "./fixture-server";
import { buildSyntheticVpk } from "./vpk";

export const CATALOG_MOD_ID = "900001";
export const CATALOG_MOD_NAME = "E2E GameBanana Mod";
const timestamp = 1_780_000_000;

type CatalogArchive = {
  id: number;
  name: string;
  files: string[];
  selected: boolean;
};
export const catalogRecipe = (scenario: string): CatalogArchive[] => {
  if (scenario.startsWith("gamebanana-switch"))
    return [
      { id: 910001, name: "common.zip", files: ["common.vpk"], selected: true },
      { id: 910002, name: "blue.zip", files: ["blue.vpk"], selected: true },
      { id: 910003, name: "red.zip", files: ["red.vpk"], selected: false },
      {
        id: 910004,
        name: "extras.zip",
        files: ["extra.vpk", "spark.vpk"],
        selected: false,
      },
    ];
  if (scenario === "gamebanana-combined")
    return [
      {
        id: 910001,
        name: "base.zip",
        files: ["base.vpk", "base-extra.vpk"],
        selected: true,
      },
      {
        id: 910002,
        name: "effects.zip",
        files: ["effects.vpk", "effects-extra.vpk"],
        selected: true,
      },
      {
        id: 910003,
        name: "alternate.zip",
        files: ["alternate.vpk"],
        selected: false,
      },
    ];
  if (scenario === "gamebanana-force-update")
    return catalogRecipe("gamebanana-multifile");
  if (
    [
      "gamebanana-reselect",
      "gamebanana-reinstall",
      "gamebanana-reinstall-disabled",
    ].includes(scenario)
  )
    return catalogRecipe("gamebanana-variants");
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
      return {
        ...recipe,
        body: await createArchive(
          Object.fromEntries(
            recipe.files.map((name) => [name, catalogVpk(name)]),
          ),
        ),
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
        .filter(
          (archive) =>
            archive.selected || scenario.startsWith("gamebanana-switch"),
        )
        .map((archive) => (Object.assign({
	method: 'GET',
	path: `/dl/${archive.id}`,
	status: 200,
	body: archive.body
}, scenario === 'gamebanana-switch-failure' && archive.name === 'red.zip' ? { sequence: [{
	status: 503,
	body: 'Fixture variant temporarily unavailable'
}, {
	status: 200,
	body: archive.body
}] } : {}))),
    ];
  };
};

export const assertCatalogNetwork = (
  scenario: string,
  requests: readonly FixtureRequest[],
): void => {
  const expected = catalogRecipe(scenario)
    .filter((archive) => archive.selected)
    .map((archive) => ({ path: `/dl/${archive.id}`, status: 200 }));
  if (
    [
      "gamebanana-reselect",
      "gamebanana-reinstall",
      "gamebanana-reinstall-disabled",
      "gamebanana-force-update",
    ].includes(scenario)
  )
    expected.push(...expected.map((request) => ({ ...request })));
  if (scenario === "gamebanana-switch")
    expected.push(
      { path: "/dl/910003", status: 200 },
      { path: "/dl/910004", status: 200 },
      { path: "/dl/910002", status: 200 },
    );
  if (scenario === "gamebanana-switch-failure")
    expected.push(
      { path: "/dl/910003", status: 503 },
      { path: "/dl/910003", status: 200 },
    );
  assert.deepEqual(
    requests
      .filter((request) => request.url.startsWith("/dl/"))
      .map((request) => ({ path: request.url, status: request.responseStatus }))
      .sort((a, b) => a.path.localeCompare(b.path)),
    expected.sort((a, b) => a.path.localeCompare(b.path)),
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
