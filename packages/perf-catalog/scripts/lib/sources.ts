import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PACKAGE_DIR } from "./fetch";

const SOURCES_PATH = join(PACKAGE_DIR, "sources.json");

/** One version of a file in a git repo. `build` is the game's ClientVersion. */
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
  /** Commit date, `YYYY-MM-DD`. */
  date: string;
  /** Release tag the commit was pinned from, for tag-tracked sources. */
  tag?: string;
  sha256: string;
  video?: { path: string; sha256: string };
}

export interface CommunityPin {
  fileId: number;
  fileName: string;
  md5: string;
  name: string;
  author: string;
  downloads: number;
  /** Last update of the mod page, `YYYY-MM-DD`. */
  updatedAt: string | null;
}

export interface Sources {
  $comment: string[];
  schemaExplorer: {
    repo: string;
    path: string;
    commit: string;
    sha256: string;
    /** DumpSource2 revision and date inside the file. */
    revision: number;
    versionDate: string;
  };
  gameTracking: {
    repo: string;
    /** `game/citadel/gameinfo.gi` at every commit that changed it, newest first. */
    gameinfo: { path: string; steamInf: string; versions: CommitPin[] };
    /** `DumpSource2/convars.txt` since `since`, newest first, to date flag changes and removals. */
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
