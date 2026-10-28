import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { z } from "zod";
import { createArchive } from "./archive-fixtures";
import type { FixtureRequest, FixtureRoute } from "./fixture-server";
import {
  BULK_HYDRATION_FIELDS,
  BULK_UPDATE_FIELDS,
} from "./gamebanana-fixtures";
import { buildSyntheticVpk } from "./vpk";

const json = (
  path: string,
  body: z.infer<ReturnType<typeof z.json>>,
): FixtureRoute => ({
  method: "GET",
  path,
  status: 200,
  body: JSON.stringify(body),
});

export type RenamedVersion = "v1" | "v2";
type PackFile = {
  key: string;
  archive: Record<RenamedVersion, string>;
  vpks: Record<RenamedVersion, readonly string[]>;
};

// GameBanana tells uploads that share a name apart with a random `_xxxxx`
// suffix, so a re-uploaded pack only keeps its name up to that suffix.
export const RENAMED_PACKS = {
  id: "930201",
  name: "E2E Renamed Packs",
  files: [
    {
      key: "a",
      archive: { v1: "pack-a.zip", v2: "pack-a.zip" },
      vpks: {
        v1: ["a-kaze.vpk", "a-ember.vpk"],
        v2: ["a-kaze.vpk", "a-ember.vpk"],
      },
    },
    {
      key: "b",
      archive: { v1: "pack-b_1a2b3.zip", v2: "pack-b_4c5d6.zip" },
      vpks: {
        v1: ["b-kaze.vpk", "b-ember.vpk"],
        v2: ["b-kaze.vpk", "b-ember.vpk", "b-new.vpk"],
      },
    },
  ],
} as const satisfies { id: string; name: string; files: readonly PackFile[] };
// The chosen VPK is gone from the re-upload, so nothing carries over.
export const PICKED_PACK = {
  id: "930202",
  name: "E2E Picked Pack",
  files: [
    {
      key: "pick",
      archive: { v1: "pick_0a1b2.zip", v2: "pick_9c8d7.zip" },
      vpks: { v1: ["red.vpk", "blue.vpk"], v2: ["red.vpk", "green.vpk"] },
    },
  ],
} as const satisfies { id: string; name: string; files: readonly PackFile[] };
export const RENAMED_MODS = [RENAMED_PACKS, PICKED_PACK] as const;

export const renamedVpk = (id: string, version: RenamedVersion, name: string) =>
  buildSyntheticVpk([
    { path: `scripts/e2e-${id}.txt`, contents: `${id}/${version}/${name}\n` },
  ]);
const downloadPath = (id: string, key: string, version: RenamedVersion) =>
  `/dl/${id}/${key}/${version}`;
// The first v2 transfer of pack A fails, so that mod waits in the batch's
// failures while the other one asks for a pick.
const FAILING_DOWNLOAD = downloadPath(RENAMED_PACKS.id, "a", "v2");

export const renamedPacksRoutes = async () => {
  const mods = await Promise.all(
    RENAMED_MODS.map(async (mod) => ({
      ...mod,
      bodies: await Promise.all(
        mod.files.map(async (file) => ({
          v1: await createArchive(
            Object.fromEntries(
              file.vpks.v1.map((name) => [
                name,
                renamedVpk(mod.id, "v1", name),
              ]),
            ),
          ),
          v2: await createArchive(
            Object.fromEntries(
              file.vpks.v2.map((name) => [
                name,
                renamedVpk(mod.id, "v2", name),
              ]),
            ),
          ),
        })),
      ),
    })),
  );
  return (origin: string): FixtureRoute[] => {
    const timestamp = 1_780_000_000;
    const files = (mod: (typeof mods)[number], version: RenamedVersion) =>
      mod.files.map((file, index) => ({
        // A re-upload is a new GameBanana file.
        _idRow: Number(mod.id) * 100 + index * 2 + (version === "v2" ? 1 : 0),
        _sFile: file.archive[version],
        _nFilesize: mod.bodies[index][version].length,
        _sDownloadUrl: `${origin}${downloadPath(mod.id, file.key, version)}`,
        _tsDateAdded: version === "v1" ? timestamp : 4_100_000_000,
        _sMd5Checksum: createHash("md5")
          .update(mod.bodies[index][version])
          .digest("hex"),
      }));
    const profiles = mods.map((mod) => ({
      _idRow: Number(mod.id),
      _sModelName: "Mod",
      _sName: mod.name,
      _sProfileUrl: `https://gamebanana.com/mods/${mod.id}`,
      _tsDateAdded: timestamp,
      _tsDateModified: timestamp,
      _bHasFiles: true,
      _aSubmitter: { _sName: "E2E Author" },
      _aRootCategory: { _sName: "Skins" },
      _aCategory: { _sName: "Skins" },
      _sText: "Synthetic packs re-uploaded under new names.",
      _aFiles: files(mod, "v1"),
    }));
    return [
      json("/apiv11/Mod/Index", {
        _aMetadata: { _nRecordCount: 2, _nPerpage: 50, _bIsComplete: true },
        _aRecords: profiles,
      }),
      {
        ...json(
          "/Core/Item/Data",
          profiles.map(({ _sName: name, _sText: description, _aFiles: v1 }) => [
            name,
            0,
            "Skins",
            "Skins",
            description,
            description,
            v1,
          ]),
        ),
        query: { "fields[]": BULK_HYDRATION_FIELDS },
      },
      // Automatic checks can request either mod before both installs finish.
      ...[mods, [mods[1]]].map((checked) =>
        Object.assign(
          json(
            "/Core/Item/Data",
            checked.map((mod) => [
              `https://gamebanana.com/mods/${mod.id}`,
              4_100_000_000,
              files(mod, "v2"),
            ]),
          ),
          {
            query: {
              "fields[]": BULK_UPDATE_FIELDS,
              "itemid[]": checked[0].id,
            },
          },
        ),
      ),
      json("/apiv11/Util/Fileservers", { _aRecords: [] }),
      ...mods.flatMap((mod, index) =>
        [
          json(`/apiv11/Mod/${mod.id}/ProfilePage`, profiles[index]),
          {
            ...json(`/apiv11/Mod/${mod.id}/DownloadPage`, {}),
            // At install the chooser fetches metadata once, then the Rust URL
            // resolver once per archive; every later request sees v2.
            sequence: [
              ...Array.from(
                { length: mod.files.length + 1 },
                (): RenamedVersion => "v1",
              ),
              "v2" as const,
            ].map((version) => ({
              status: 200,
              body: JSON.stringify({ _aFiles: files(mod, version) }),
            })),
          },
          json(`/apiv11/Mod/${mod.id}/Updates`, {
            _aMetadata: { _nRecordCount: 0, _nPerpage: 10, _bIsComplete: true },
            _aRecords: [],
          }),
          json(`/api/v2/reports/mod/${mod.id}/counts`, {
            total: 0,
            open: 0,
            resolved: 0,
            dismissed: 0,
          }),
        ].concat(
          mod.files.flatMap((file, fileIndex) =>
            (["v1", "v2"] as const).map((version): FixtureRoute => {
              const path = downloadPath(mod.id, file.key, version);
              const body = mod.bodies[fileIndex][version];
              return {
                method: "GET",
                path,
                status: 200,
                body,
                sequence:
                  path === FAILING_DOWNLOAD
                    ? [
                        { status: 404, body: "Not found" },
                        { status: 200, body },
                      ]
                    : undefined,
              };
            }),
          ),
        ),
      ),
    ];
  };
};

export const assertRenamedPacksNetwork = (
  _id: string,
  requests: readonly FixtureRequest[],
) => {
  const transfers = requests
    .filter((request) => request.url.startsWith("/dl/"))
    .map((request) => `${request.url} ${request.responseStatus}`);
  const count = (transfer: string) =>
    transfers.filter((item) => item === transfer).length;
  assert.equal(count(`${FAILING_DOWNLOAD} 404`), 1, transfers.join("\n"));
  assert.equal(count(`${FAILING_DOWNLOAD} 200`), 1, transfers.join("\n"));
  // The pick runs the update again, so the picked pack downloads twice.
  assert.equal(
    count(`${downloadPath(PICKED_PACK.id, "pick", "v2")} 200`),
    2,
    transfers.join("\n"),
  );
  for (const mod of RENAMED_MODS)
    for (const file of mod.files)
      assert.equal(
        count(`${downloadPath(mod.id, file.key, "v1")} 200`),
        1,
        transfers.join("\n"),
      );
};
