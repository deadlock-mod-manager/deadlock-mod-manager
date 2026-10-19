import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { worldManifestSchema } from "./contracts";
import type { FixtureRequest, FixtureRoute } from "./fixture-server";
import type { CreatedWorld } from "./world";

export const UPDATE_VERSION = "99.0.0-nightly.e2e";
export const UPDATE_PATH = "/releases/download/nightly/fixture-update.bin";
const payload = "DMM updater E2E payload: intentionally unsigned\n";

export const appUpdateRoutes =
  async (id: string) =>
  (origin: string): readonly FixtureRoute[] => [
    {
      method: "GET",
      path: "/updater/latest.json",
      status: id === "app-update-check-failure" ? 404 : 200,
      body: JSON.stringify({
        version: UPDATE_VERSION,
        notes: "Synthetic nightly update",
        platforms: Object.fromEntries(
          ["linux-x86_64", "windows-x86_64"].map((target) => [
            target,
            {
              url: `${origin}${UPDATE_PATH}`,
              signature: "invalid-e2e-signature",
            },
          ]),
        ),
      }),
    },
    { method: "GET", path: UPDATE_PATH, status: 200, body: payload },
  ];

export const prepareAppUpdateWorld = async (world: CreatedWorld) => {
  world.configuration.integrations.updater = "fixture";
  await writeFile(world.configPath, JSON.stringify(world.configuration));
  const manifest = worldManifestSchema.parse(
    JSON.parse(await readFile(world.manifestPath, "utf8")),
  );
  manifest.configuration = world.configuration;
  await writeFile(world.manifestPath, JSON.stringify(manifest));
  await writeFile(
    path.join(world.configuration.roots.appConfig, "update-channel.json"),
    JSON.stringify({ channel: "nightly" }),
  );
};

export const assertAppUpdateNetwork = (
  id: string,
  requests: readonly FixtureRequest[],
) => {
  const checks = requests.filter(
    (request) => request.url === "/updater/latest.json",
  );
  const transfers = requests.filter((request) => request.url === UPDATE_PATH);
  const status = id === "app-update-check-failure" ? 404 : 200;
  if (
    !checks.length ||
    checks.some((request) => request.responseStatus !== status)
  )
    throw new Error(`Expected updater metadata HTTP ${status}`);
  if (status === 404) {
    if (transfers.length)
      throw new Error("A failed check must not download an update");
    return;
  }
  if (
    transfers.length !== 1 ||
    transfers[0].responseStatus !== 200 ||
    transfers[0].responseBytes !== Buffer.byteLength(payload)
  )
    throw new Error(
      "Expected exactly one complete transfer from the manifest URL",
    );
};
