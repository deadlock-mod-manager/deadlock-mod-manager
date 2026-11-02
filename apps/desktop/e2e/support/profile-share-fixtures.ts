// A friend's profile share code, served by a fake share API and GameBanana.
import { createArchive } from "./archive-fixtures";
import type { FixtureRoute } from "./fixture-server";
import {
  BULK_HYDRATION_FIELDS,
  BULK_UPDATE_FIELDS,
  catalogVpk,
} from "./gamebanana-fixtures";

export const SHARE_CODE = "e2esharecode0001";
/** `shared` marks the archives the friend picked. */
type ShareArchive = { id: number; name: string; vpk: string; shared: boolean };
export type ShareMod = { id: string; name: string; archives: ShareArchive[] };
export const SHARE_MODS: ShareMod[] = [
  {
    id: "920001",
    name: "E2E Share Alpha",
    archives: [
      { id: 921001, name: "alpha.zip", vpk: "alpha.vpk", shared: true },
    ],
  },
  {
    id: "920002",
    name: "E2E Share Bravo",
    archives: [
      { id: 922001, name: "bravo.zip", vpk: "bravo.vpk", shared: true },
    ],
  },
  {
    // The friend picked only Charlie's effects archive.
    id: "920003",
    name: "E2E Share Charlie",
    archives: [
      {
        id: 923001,
        name: "charlie-base.zip",
        vpk: "charlie-base.vpk",
        shared: false,
      },
      {
        id: 923002,
        name: "charlie-effects.zip",
        vpk: "charlie-effects.vpk",
        shared: true,
      },
      {
        id: 923003,
        name: "charlie-alt.zip",
        vpk: "charlie-alt.vpk",
        shared: false,
      },
    ],
  },
];
/** The friend's load order: Charlie, then Alpha, then Bravo. */
const SHARED_LOAD_ORDER = ["920003", "920001", "920002"];

const timestamp = 1_793_000_000;
const json = (route: string, body: string): FixtureRoute => ({
  method: "GET",
  path: route,
  status: 200,
  body,
});
const index = (records: readonly object[]) =>
  JSON.stringify({
    _aMetadata: {
      _nRecordCount: records.length,
      _nPerpage: 50,
      _bIsComplete: true,
    },
    _aRecords: records,
  });

export const shareRoutes = async () => {
  const archives = new Map<number, Buffer>();
  for (const mod of SHARE_MODS)
    for (const archive of mod.archives)
      archives.set(
        archive.id,
        await createArchive({ [archive.vpk]: catalogVpk(archive.vpk) }),
      );
  const size = (archive: ShareArchive) => archives.get(archive.id)?.length ?? 0;
  return (origin: string): FixtureRoute[] => {
    const url = (archive: ShareArchive) => `${origin}/dl/${archive.id}`;
    const mods = SHARE_MODS.map((mod) => {
      const profileUrl = `https://gamebanana.com/mods/${mod.id}`;
      const text = "Synthetic share fixture";
      const files = mod.archives.map((archive) => ({
        _idRow: archive.id,
        _sFile: archive.name,
        _nFilesize: size(archive),
        _sDownloadUrl: url(archive),
        _tsDateAdded: timestamp,
      }));
      const profile = {
        _idRow: Number(mod.id),
        _sModelName: "Mod",
        _sName: mod.name,
        _sProfileUrl: profileUrl,
        _tsDateAdded: timestamp,
        _tsDateModified: timestamp,
        _bHasFiles: true,
        _sText: text,
        _aSubmitter: { _sName: "E2E Friend" },
        _aRootCategory: { _sName: "Skins" },
        _aCategory: { _sName: "Skins" },
        _aFiles: files,
      };
      return { id: mod.id, name: mod.name, profileUrl, text, files, profile };
    });
    const shared = {
      version: "3",
      payload: {
        mods: SHARE_MODS.map((mod) => ({
          remoteId: mod.id,
          submissionType: "mod",
          selectedDownloads: mod.archives
            .filter((archive) => archive.shared)
            .map((archive) => ({
              remoteId: mod.id,
              file: archive.name,
              url: url(archive),
              size: size(archive),
            })),
        })),
        loadOrder: SHARED_LOAD_ORDER,
      },
    };
    return [
      json("/api/v2/feature-flags", "[]"),
      json("/apiv11/Mod/Index", index(mods.map((mod) => mod.profile))),
      {
        ...json(
          "/Core/Item/Data",
          JSON.stringify(
            mods.map(({ name, text, files }) => [
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
      json("/apiv11/Util/Fileservers", '{"_aRecords":[]}'),
      ...mods.flatMap(({ id, profileUrl, files, profile }) => [
        json(`/apiv11/Mod/${id}/ProfilePage`, JSON.stringify(profile)),
        json(
          `/apiv11/Mod/${id}/DownloadPage`,
          JSON.stringify({ _aFiles: files }),
        ),
        json(`/apiv11/Mod/${id}/Updates`, index([])),
        json(
          `/api/v2/reports/mod/${id}/counts`,
          '{"total":0,"open":0,"resolved":0,"dismissed":0}',
        ),
        {
          ...json(
            "/Core/Item/Data",
            JSON.stringify([profileUrl, timestamp, files]),
          ),
          query: { "itemid[]": id, "fields[]": BULK_UPDATE_FIELDS },
        },
      ]),
      ...[...archives].map(
        ([id, body]): FixtureRoute => ({
          method: "GET",
          path: `/dl/${id}`,
          status: 200,
          body,
        }),
      ),
      json(`/api/v2/profiles/${SHARE_CODE}`, JSON.stringify(shared)),
    ];
  };
};
