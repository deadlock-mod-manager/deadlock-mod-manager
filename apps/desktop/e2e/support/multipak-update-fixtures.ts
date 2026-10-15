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

export const MULTIPAK_MODS = [
  {
    id: "930001",
    name: "E2E Multipak A",
    archive: "multipak-a.zip",
    versions: {
      v1: ["a-base.vpk", "a-removed.vpk", "a-old-name.vpk"],
      v2: ["a-base.vpk", "a-new-name.vpk"],
    },
  },
  {
    id: "930002",
    name: "E2E Multipak B",
    archive: "multipak-b.zip",
    versions: {
      v1: ["b-base.vpk", "b-effects.vpk"],
      v2: ["b-base.vpk", "b-effects.vpk"],
    },
  },
] as const;
export type MultipakVersion = "v1" | "v2";
export const multipakVpk = (
  id: string,
  version: MultipakVersion,
  name: string,
) =>
  buildSyntheticVpk([
    { path: `scripts/e2e-${id}.txt`, contents: `${id}/${version}/${name}\n` },
  ]);

export const multipakUpdateRoutes = async () => {
  const archives = await Promise.all(
    MULTIPAK_MODS.map(async (mod) => ({
      ...mod,
      bodies: Object.fromEntries(
        await Promise.all(
          (["v1", "v2"] as const).map(async (version) => [
            version,
            await createArchive(
              Object.fromEntries(
                mod.versions[version].map((name) => [
                  name,
                  multipakVpk(mod.id, version, name),
                ]),
              ),
            ),
          ]),
        ),
      ),
    })),
  );
  return (origin: string): FixtureRoute[] => {
    const timestamp = 1_780_000_000;
    const file = (
      mod: (typeof archives)[number],
      version: MultipakVersion,
    ) => ({
      _idRow: Number(mod.id),
      _sFile: mod.archive,
      _nFilesize: mod.bodies[version].length,
      _sDownloadUrl: `${origin}/dl/${mod.id}/${version}`,
      _tsDateAdded: version === "v1" ? timestamp : 4_100_000_000,
      _sMd5Checksum: createHash("md5")
        .update(mod.bodies[version])
        .digest("hex"),
    });
    const profiles = archives.map((mod) => ({
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
      _sText: "Synthetic multipak update fixture.",
      _aFiles: [file(mod, "v1")],
    }));
    return [
      json("/apiv11/Mod/Index", {
        _aMetadata: { _nRecordCount: 2, _nPerpage: 50, _bIsComplete: true },
        _aRecords: profiles,
      }),
      {
        ...json(
          "/Core/Item/Data",
          profiles.map(
            ({ _sName: name, _sText: description, _aFiles: files }) => [
              name,
              0,
              "Skins",
              "Skins",
              description,
              description,
              files,
            ],
          ),
        ),
        query: { "fields[]": BULK_HYDRATION_FIELDS },
      },
      // Automatic checks can request either mod before both installs finish.
      ...[archives, [archives[1]]].map((mods) =>
        Object.assign(
          json(
            "/Core/Item/Data",
            mods.map((mod) => [
              `https://gamebanana.com/mods/${mod.id}`,
              4_100_000_000,
              [file(mod, "v2")],
            ]),
          ),
          {
            query: {
              "fields[]": BULK_UPDATE_FIELDS,
              "itemid[]": mods[0].id,
            },
          },
        ),
      ),
      json("/apiv11/Util/Fileservers", { _aRecords: [] }),
      ...archives.flatMap((mod, index) =>
        [
          json(`/apiv11/Mod/${mod.id}/ProfilePage`, profiles[index]),
          Object.assign(json(`/apiv11/Mod/${mod.id}/DownloadPage`, {}), {
            // The chooser and Rust URL resolver each fetch metadata at install.
            sequence: (["v1", "v1", "v2"] as const).map((version) => ({
              status: 200,
              body: JSON.stringify({ _aFiles: [file(mod, version)] }),
            })),
          }),
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
          (["v1", "v2"] as const).map((version) => ({
            method: "GET",
            path: `/dl/${mod.id}/${version}`,
            status: 200,
            body: mod.bodies[version],
          })),
        ),
      ),
    ];
  };
};

export const assertMultipakUpdateNetwork = (
  _id: string,
  requests: readonly FixtureRequest[],
) => {
  assert.deepEqual(
    requests
      .filter((request) => request.url.startsWith("/dl/"))
      .map((request) => ({ path: request.url, status: request.responseStatus }))
      .sort((a, b) => a.path.localeCompare(b.path)),
    MULTIPAK_MODS.flatMap((mod) =>
      ["v1", "v2"].map((version) => ({
        path: `/dl/${mod.id}/${version}`,
        status: 200,
      })),
    ).sort((a, b) => a.path.localeCompare(b.path)),
  );
};
