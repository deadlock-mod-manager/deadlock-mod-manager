import assert from "node:assert/strict";
import { createArchive } from "./archive-fixtures";
import type { FixtureRequest, FixtureRoute } from "./fixture-server";
import {
  BULK_HYDRATION_FIELDS,
  BULK_UPDATE_FIELDS,
  catalogVpk,
} from "./gamebanana-fixtures";

const COLLECTION_ID = "950001";
export const COLLECTION_NAME = "E2E Collection";
export const collectionMods = [
  { id: "940001", name: "E2E Collection Skin" },
  // Its first transfer fails; the retry succeeds.
  { id: "940002", name: "E2E Collection Flaky Skin" },
];
// After the outdated-mod cutoff, so no card is badged as outdated.
const timestamp = 1_793_000_000;
// Collections below GameBanana's listing threshold are never shown or crawled.
const LISTED_ITEM_COUNT = 10;

const json = (path: string, body: string): FixtureRoute => ({
  method: "GET",
  path,
  status: 200,
  body,
});
const indexPage = <T>(records: readonly T[]) =>
  JSON.stringify({
    _aMetadata: {
      _nRecordCount: records.length,
      _nPerpage: 50,
      _bIsComplete: true,
    },
    _aRecords: records,
  });

export const collectionRoutes = async () => {
  const [steadyArchive, flakyArchive] = await Promise.all(
    collectionMods.map((mod) =>
      createArchive({ [`${mod.id}.vpk`]: catalogVpk(mod.name) }),
    ),
  );
  const [steady, flaky] = collectionMods;
  return (origin: string): FixtureRoute[] => {
    const profiles = collectionMods.map((mod) => ({
      _idRow: Number(mod.id),
      _sModelName: "Mod",
      _sName: mod.name,
      _sProfileUrl: `https://gamebanana.com/mods/${mod.id}`,
      _tsDateAdded: timestamp,
      _tsDateModified: timestamp,
      _bHasFiles: true,
      _sText: "Synthetic collection fixture",
      _aSubmitter: { _sName: "E2E Author" },
      _aRootCategory: { _sName: "Skins" },
      _aCategory: { _sName: "Skins" },
      _aFiles: [
        {
          _idRow: Number(mod.id),
          _sFile: `${mod.id}.zip`,
          _nFilesize: (mod === flaky ? flakyArchive : steadyArchive).length,
          _sDownloadUrl: `${origin}/dl/${mod.id}`,
          _tsDateAdded: timestamp,
        },
      ],
    }));
    return [
      json("/apiv11/Mod/Index", indexPage(profiles)),
      {
        ...json(
          "/Core/Item/Data",
          JSON.stringify(
            profiles.map(({ _sName: name, _aFiles: files, _sText: text }) => [
              name,
              0,
              "Skins",
              "Skins",
              text,
              text,
              files,
            ]),
          ),
        ),
        query: { "fields[]": BULK_HYDRATION_FIELDS },
      },
      json(
        "/apiv11/Collection/Index",
        indexPage([
          {
            _idRow: Number(COLLECTION_ID),
            _sModelName: "Collection",
            _sName: COLLECTION_NAME,
            _sProfileUrl: `https://gamebanana.com/collections/${COLLECTION_ID}`,
            _tsDateAdded: timestamp,
            _tsDateModified: timestamp,
            _aSubmitter: { _idRow: 930001, _sName: "E2E Curator" },
            _nItemCount: LISTED_ITEM_COUNT,
          },
        ]),
      ),
      {
        ...json(
          "/Core/Item/Data",
          JSON.stringify(["Synthetic collection", "Synthetic collection"]),
        ),
        query: { "itemtype[]": "Collection" },
      },
      json(
        `/apiv11/Collection/${COLLECTION_ID}/Items`,
        indexPage(
          profiles.map(({ _idRow, _sModelName, _sName, _sProfileUrl }) => ({
            _idRow,
            _sModelName,
            _sName,
            _sProfileUrl,
          })),
        ),
      ),
      json("/apiv11/Util/Fileservers", '{"_aRecords":[]}'),
      ...profiles.flatMap(({ _idRow: id, _aFiles: files }) => [
        json(
          `/apiv11/Mod/${id}/DownloadPage`,
          JSON.stringify({ _aFiles: files }),
        ),
        // Update checks for downloaded mods.
        {
          ...json(
            "/Core/Item/Data",
            JSON.stringify([
              `https://gamebanana.com/mods/${id}`,
              timestamp,
              files,
            ]),
          ),
          query: { "itemid[]": String(id), "fields[]": BULK_UPDATE_FIELDS },
        },
      ]),
      {
        method: "GET",
        path: `/dl/${steady.id}`,
        status: 200,
        body: steadyArchive,
      },
      {
        method: "GET",
        path: `/dl/${flaky.id}`,
        status: 200,
        body: flakyArchive,
        sequence: [
          { status: 503, body: "Fixture file temporarily unavailable" },
          { status: 200, body: flakyArchive },
        ],
      },
    ];
  };
};

export const assertCollectionNetwork = (
  _id: string,
  requests: readonly FixtureRequest[],
): void => {
  const [steady, flaky] = collectionMods.map((mod) => `/dl/${mod.id}`);
  assert.deepEqual(
    requests
      .filter((request) => request.url.startsWith("/dl/"))
      .map((request) => ({ path: request.url, status: request.responseStatus }))
      .sort((a, b) => a.path.localeCompare(b.path)),
    [
      { path: steady, status: 200 },
      { path: flaky, status: 503 },
      { path: flaky, status: 200 },
    ],
  );
};
