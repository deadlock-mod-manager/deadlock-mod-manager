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

export const VARIANT_MOD = {
  id: "930101",
  name: "E2E Variant Names",
} as const;
// Every variant ships the same VPK filename, so only the install names the
// archive gives them keep them apart.
export const VARIANTS = [
  { archive: "Red Skin.zip", name: "pak01-red-skin_dir.vpk" },
  { archive: "blue.zip", name: "pak01-blue_dir.vpk" },
  { archive: "green.zip", name: "pak01-green_dir.vpk" },
] as const;
export const VARIANT_SOURCE_NAME = "pak01_dir.vpk";
export type VariantVersion = "v1" | "v2";
export const variantVpk = (archive: string, version: VariantVersion) =>
  buildSyntheticVpk([
    {
      path: `scripts/e2e-${VARIANT_MOD.id}.txt`,
      contents: `${archive}/${version}\n`,
    },
  ]);
const variantPath = (index: number, version: VariantVersion) =>
  `/dl/${VARIANT_MOD.id}/${index}/${version}`;

export const variantNamesRoutes = async () => {
  const bodies = await Promise.all(
    VARIANTS.map(async (variant) =>
      Object.fromEntries(
        await Promise.all(
          (["v1", "v2"] as const).map(async (version) => [
            version,
            await createArchive({
              [VARIANT_SOURCE_NAME]: variantVpk(variant.archive, version),
            }),
          ]),
        ),
      ),
    ),
  );
  return (origin: string): FixtureRoute[] => {
    const timestamp = 1_780_000_000;
    const files = (version: VariantVersion) =>
      VARIANTS.map((variant, index) => ({
        _idRow: Number(VARIANT_MOD.id) * 10 + index,
        _sFile: variant.archive,
        _nFilesize: bodies[index][version].length,
        _sDownloadUrl: `${origin}${variantPath(index, version)}`,
        _tsDateAdded: version === "v1" ? timestamp : 4_100_000_000,
        _sMd5Checksum: createHash("md5")
          .update(bodies[index][version])
          .digest("hex"),
      }));
    const profileUrl = `https://gamebanana.com/mods/${VARIANT_MOD.id}`;
    const description = "Synthetic variants sharing one VPK filename.";
    const profile = {
      _idRow: Number(VARIANT_MOD.id),
      _sModelName: "Mod",
      _sName: VARIANT_MOD.name,
      _sProfileUrl: profileUrl,
      _tsDateAdded: timestamp,
      _tsDateModified: timestamp,
      _bHasFiles: true,
      _aSubmitter: { _sName: "E2E Author" },
      _aRootCategory: { _sName: "Skins" },
      _aCategory: { _sName: "Skins" },
      _sText: description,
      _aFiles: files("v1"),
    };
    return [
      json("/apiv11/Mod/Index", {
        _aMetadata: { _nRecordCount: 1, _nPerpage: 50, _bIsComplete: true },
        _aRecords: [profile],
      }),
      {
        ...json("/Core/Item/Data", [
          [
            VARIANT_MOD.name,
            0,
            "Skins",
            "Skins",
            description,
            description,
            files("v1"),
          ],
        ]),
        query: { "fields[]": BULK_HYDRATION_FIELDS },
      },
      {
        ...json("/Core/Item/Data", [[profileUrl, 4_100_000_000, files("v2")]]),
        query: { "fields[]": BULK_UPDATE_FIELDS, "itemid[]": VARIANT_MOD.id },
      },
      json("/apiv11/Util/Fileservers", { _aRecords: [] }),
      json(`/apiv11/Mod/${VARIANT_MOD.id}/ProfilePage`, profile),
      Object.assign(json(`/apiv11/Mod/${VARIANT_MOD.id}/DownloadPage`, {}), {
        // At install the chooser fetches metadata once, then the Rust URL
        // resolver once per archive.
        sequence: (["v1", "v1", "v1", "v1", "v2"] as const).map((version) => ({
          status: 200,
          body: JSON.stringify({ _aFiles: files(version) }),
        })),
      }),
      json(`/apiv11/Mod/${VARIANT_MOD.id}/Updates`, {
        _aMetadata: { _nRecordCount: 0, _nPerpage: 10, _bIsComplete: true },
        _aRecords: [],
      }),
      json(`/api/v2/reports/mod/${VARIANT_MOD.id}/counts`, {
        total: 0,
        open: 0,
        resolved: 0,
        dismissed: 0,
      }),
      ...VARIANTS.flatMap((_, index) =>
        (["v1", "v2"] as const).map((version) => ({
          method: "GET",
          path: variantPath(index, version),
          status: 200,
          body: bodies[index][version],
        })),
      ),
    ];
  };
};

export const assertVariantNamesNetwork = (
  _id: string,
  requests: readonly FixtureRequest[],
) => {
  assert.deepEqual(
    requests
      .filter((request) => request.url.startsWith("/dl/"))
      .map((request) => ({ path: request.url, status: request.responseStatus }))
      .sort((a, b) => a.path.localeCompare(b.path)),
    VARIANTS.flatMap((_, index) =>
      (["v1", "v2"] as const).map((version) => ({
        path: variantPath(index, version),
        status: 200,
      })),
    )
      // Re-enabling blue after the update fetches its v2 archive again.
      .concat({ path: variantPath(1, "v2"), status: 200 })
      .sort((a, b) => a.path.localeCompare(b.path)),
  );
};
