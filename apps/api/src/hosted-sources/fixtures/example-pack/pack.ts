import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePakList } from "../../pak-list";
import type { HostedSourceDefinition, HostedSourceSnapshot } from "../../types";

const ADDONS = "game/citadel/addons";
const OPTIONAL = "game/citadel/optional-addons";

const read = (name: string) =>
  readFileSync(join(import.meta.dir, name), "utf8");

/**
 * A pack shaped like the archives hosted sources are for: suggested paks in
 * `addons`, extras in `optional-addons`, one of which replaces a default pak.
 */
export const examplePack: HostedSourceDefinition = {
  id: "example-pack",
  name: "Example pack",
  author: "Example authors",
  description: "A pack with a config, a variant pak and extras.",
  homepageUrl: "https://packs.example.org/",
  tags: ["performance"],
  archiveUrl: "https://packs.example.org/dl/example-pack.zip",
  flag: "hosted-source-example-pack",
  roots: [
    { path: ADDONS, selection: "default", label: "Pack mods" },
    { path: OPTIONAL, selection: "optional", label: "Extras" },
  ],
  labelFiles: [`${ADDONS}/mods.txt`, `${OPTIONAL}/mods.txt`],
  groups: [
    {
      id: "effects",
      label: "Effects",
      min: 0,
      max: 1,
      paths: [`${ADDONS}/pak02_dir.vpk`, `${OPTIONAL}/pak02_dir.vpk`],
      defaults: [`${ADDONS}/pak02_dir.vpk`],
    },
    {
      id: "outlines",
      label: "Outlines",
      min: 0,
      max: 1,
      paths: [`${ADDONS}/pak03_dir.vpk`, `${ADDONS}/pak04_dir.vpk`],
      defaults: [`${ADDONS}/pak03_dir.vpk`],
    },
  ],
};

export const examplePackSnapshot: HostedSourceSnapshot = {
  etag: '"example-etag"',
  lastModified: "Fri, 06 Nov 2026 05:26:32 GMT",
  sha256: "a".repeat(64),
  size: 4096,
  vpkPaths: read("entries.txt")
    .split("\n")
    .filter((path) => path.endsWith(".vpk")),
  labels: {
    ...parsePakList(`${ADDONS}/mods.txt`, read("addons-mods.txt")),
    ...parsePakList(`${OPTIONAL}/mods.txt`, read("optional-addons-mods.txt")),
  },
  fetchedAt: "2026-11-08T00:00:00.000Z",
};
