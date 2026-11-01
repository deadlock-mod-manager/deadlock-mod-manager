import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { FixtureRequest, FixtureRoute } from "./fixture-server";
import { buildSyntheticVpk } from "./vpk";
import type { CreatedWorld } from "./world";

const ANALYSE_PATH = "/api/v2/vpk-analyse-hashes";

/** Two VPKs the identification service is asked about, one it can't parse. */
export const LOOKUP_FILES = ["pak01_dir.vpk", "pak02_dir.vpk"] as const;
export const CORRUPT_FILE = "pak03_dir.vpk";

export const analyzeFileBytes = (name: string): Buffer =>
  name === CORRUPT_FILE
    ? Buffer.from("not a vpk\n")
    : buildSyntheticVpk([
        {
          path: `scripts/e2e-analyze-${name}.txt`,
          contents: `DMM analyze errors fixture ${name}\n`,
        },
      ]);

export const prepareAnalyzeErrorsWorld = async (world: CreatedWorld) => {
  const addons = path.join(
    world.configuration.roots.game,
    "game",
    "citadel",
    "addons",
  );
  for (const name of [...LOOKUP_FILES, CORRUPT_FILE])
    await writeFile(path.join(addons, name), analyzeFileBytes(name));
};

// The service fails the first lookup and answers "no match" for the second,
// so one readable file can't be checked and the other is genuinely unknown.
export const analyzeErrorsRoutes = async () => (): readonly FixtureRoute[] => [
  {
    method: "POST",
    path: ANALYSE_PATH,
    status: 503,
    body: "",
    sequence: [
      { status: 503, body: "Service Unavailable" },
      { status: 200, body: "[]" },
    ],
  },
  {
    method: "GET",
    path: "/apiv11/Util/Fileservers",
    status: 200,
    body: '{"_aRecords":[]}',
  },
];

export const assertAnalyzeErrorsNetwork = (
  _id: string,
  requests: readonly FixtureRequest[],
) => {
  const lookups = requests.filter(
    (request) =>
      request.method === "POST" && request.url.includes(ANALYSE_PATH),
  );
  const statuses = lookups.map((request) => request.responseStatus);
  if (statuses.length !== 2 || statuses[0] !== 503 || statuses[1] !== 200)
    throw new Error(
      `Expected one failed and one empty lookup, got ${JSON.stringify(statuses)}`,
    );
};
