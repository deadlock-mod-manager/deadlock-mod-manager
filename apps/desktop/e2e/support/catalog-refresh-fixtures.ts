import assert from "node:assert/strict";
import { contentMods, contentRoutes } from "./content-fixtures";
import type { FixtureRequest, FixtureRoute } from "./fixture-server";
import { BULK_HYDRATION_FIELDS } from "./gamebanana-fixtures";

export const REFRESH_SOUND_NAME = "E2E Newly Uploaded Sound";
const REFRESH_SOUND_ID = "93854";

export const catalogRefreshRoutes = async () => {
  const base = await contentRoutes();
  return (origin: string): FixtureRoute[] => {
    const sound = {
      _idRow: Number(REFRESH_SOUND_ID),
      _sModelName: "Sound",
      _sName: REFRESH_SOUND_NAME,
      _sProfileUrl: `https://gamebanana.com/sounds/${REFRESH_SOUND_ID}`,
      _tsDateAdded: 1780000500,
      _tsDateModified: 1780000500,
      _bHasFiles: true,
      _aSubmitter: { _idRow: 930001, _sName: "E2E Author" },
      _aRootCategory: { _sName: "Abilities" },
      _sInitialVisibility: "show",
    };
    return [
      {
        method: "GET",
        path: "/apiv11/Sound/Index",
        query: { _sSort: "Generic_LatestModified" },
        status: 200,
        chunkBytes: 1024,
        chunkDelayMs: 500,
        body: JSON.stringify({
          _aMetadata: { _nRecordCount: 1, _nPerpage: 50, _bIsComplete: true },
          _aRecords: [sound],
        }),
      },
      {
        method: "GET",
        path: "/Core/Item/Data",
        query: { "itemtype[]": "Sound", "fields[]": BULK_HYDRATION_FIELDS },
        status: 200,
        body: JSON.stringify([
          [
            REFRESH_SOUND_NAME,
            0,
            "Abilities",
            "Abilities",
            "New sound",
            "New sound",
            [],
          ],
        ]),
      },
      ...base(origin),
    ];
  };
};

export const assertCatalogRefreshNetwork = (
  _id: string,
  requests: readonly FixtureRequest[],
) => {
  const indexes = requests.filter((request) =>
    /\/apiv11\/(Mod|Sound|Wip)\/Index/.test(request.url),
  );
  const incremental = indexes.filter(
    (request) =>
      new URL(request.url, "http://fixture").searchParams.get("_sSort") ===
      "Generic_LatestModified",
  );
  assert.equal(
    incremental.length,
    6,
    "Two manual refreshes should each check the three latest indexes",
  );
  const details = requests.filter((request) =>
    request.url.includes("/Core/Item/Data"),
  );
  assert.equal(
    details.length,
    2,
    "Only the initial catalog and the newly uploaded sound should be hydrated",
  );
  const sound = new URL(details[1].url, "http://fixture");
  assert.deepEqual(sound.searchParams.getAll("itemid[]"), [REFRESH_SOUND_ID]);
  assert.deepEqual(sound.searchParams.getAll("itemtype[]"), ["Sound"]);
  assert(
    !incremental.some(
      (request) =>
        new URL(request.url, "http://fixture").searchParams.get("_nPage") !==
        "1",
    ),
  );
  assert(details[0].url.includes(contentMods[0].id));
};
