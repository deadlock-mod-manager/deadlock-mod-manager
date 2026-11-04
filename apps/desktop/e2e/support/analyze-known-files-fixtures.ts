import path from "node:path";
import type { FixtureRequest } from "./fixture-server";
import { buildSyntheticVpk, writeSyntheticVpk } from "./vpk";
import type { CreatedWorld } from "./world";

/**
 * Two hand-installed addons nobody has published, both named `pak01_dir.vpk`:
 * one in the base folder and one in the `addons2` overflow shard.
 */
export const UNKNOWN_ADDONS = [
  { locator: "pak01_dir.vpk", root: "addons", name: "Base addon" },
  { locator: "addons2/pak01_dir.vpk", root: "addons2", name: "Overflow addon" },
] as const;

const recipe = (root: string) => [
  {
    path: "scripts/e2e-unknown-addon.txt",
    contents: `A hand-installed addon in ${root}`,
  },
];

export const unknownAddonBytes = (root: string) =>
  buildSyntheticVpk(recipe(root));

export const prepareUnknownAddonWorld = async (world: CreatedWorld) => {
  for (const { root } of UNKNOWN_ADDONS) {
    await writeSyntheticVpk(
      path.join(
        world.configuration.roots.game,
        "game",
        "citadel",
        root,
        "pak01_dir.vpk",
      ),
      recipe(root),
    );
  }
};

export const unknownAddonRoutes = async () => () => [
  {
    method: "POST",
    path: "/api/v2/vpk-analyse-hashes",
    status: 200,
    body: "[]",
  },
  {
    method: "GET",
    path: "/apiv11/Util/Fileservers",
    status: 200,
    body: '{"_aRecords":[]}',
  },
];

export const assertUnknownAddonNetwork = (
  _id: string,
  requests: readonly FixtureRequest[],
) => {
  if (
    !requests.some(
      (request) =>
        request.method === "POST" &&
        request.url.includes("/api/v2/vpk-analyse-hashes") &&
        request.responseStatus === 200,
    )
  )
    throw new Error("Analyze never looked up the hand-installed addons");
};
