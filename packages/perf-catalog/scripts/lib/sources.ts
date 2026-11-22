import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PACKAGE_DIR } from "./fetch";

const SOURCES_PATH = join(PACKAGE_DIR, "sources.json");

export interface CommitPin {
  commit: string;
  date: string;
  build: number;
  sha256: string;
}

export interface UpstreamPin {
  repo: string;
  path: string;
  commit: string;
  date: string;
  tag?: string;
  sha256: string;
  videos?: { path: string; sha256: string }[];
}

export interface CommunityPin {
  fileId: number;
  fileName: string;
  md5: string;
  name: string;
  author: string;
  downloads: number;
  updatedAt: string | null;
}

export interface Sources {
  $comment: string[];
  schemaExplorer: {
    repo: string;
    path: string;
    commit: string;
    sha256: string;
    revision: number;
    versionDate: string;
  };
  gameTracking: {
    repo: string;
    gameinfo: { path: string; steamInf: string; versions: CommitPin[] };
    convarHistory: { path: string; since: string; versions: CommitPin[] };
  };
  upstream: Record<string, UpstreamPin>;
  community: Record<string, CommunityPin>;
}

export const readSources = (): Sources =>
  JSON.parse(readFileSync(SOURCES_PATH, "utf8"));

export const writeSources = (sources: Sources) => {
  writeFileSync(SOURCES_PATH, `${JSON.stringify(sources, null, 2)}\n`);
};
