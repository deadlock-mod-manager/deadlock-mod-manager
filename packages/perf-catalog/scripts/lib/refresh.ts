import { z } from "zod";
import { COMMUNITY } from "../../curated/community";
import { UPSTREAM_FILES } from "../../curated/presets";
import {
  decodeText,
  fetchBytes,
  githubApi,
  githubApiPaged,
  githubRawUrl,
  mapLimit,
  sha256,
} from "./fetch";
import { refreshCommunityPin } from "./gamebanana";
import { schemaHeaderSchema } from "./schema-explorer";
import type { CommitPin, Sources, UpstreamPin } from "./sources";

const githubCommitSchema = z.object({
  sha: z.string(),
  commit: z.object({
    message: z.string(),
    committer: z.object({ date: z.string() }),
  }),
});
const githubCommitsSchema = z.array(githubCommitSchema);
const githubReleaseSchema = z.object({ tag_name: z.string() });

type GithubCommit = z.infer<typeof githubCommitSchema>;

const day = (iso: string) => iso.slice(0, 10);

const clientVersion = (steamInf: string): number | null => {
  const match = /^ClientVersion=(\d+)/m.exec(steamInf);
  return match ? Number(match[1]) : null;
};

/** GameTracking commit messages start with the build: `6711 | 7422 files | ...`. */
const buildFromMessage = (message: string): number | null => {
  const match = /^(\d+)\s*\|/.exec(message);
  return match ? Number(match[1]) : null;
};

const latestCommitFor = async (
  repo: string,
  path: string,
): Promise<GithubCommit> => {
  const [commit] = await githubApi(
    `repos/${repo}/commits?path=${encodeURIComponent(path)}&per_page=1`,
    githubCommitsSchema,
  );
  if (!commit) throw new Error(`${repo}: no commit touches ${path}`);
  return commit;
};

const refreshUpstream = async (
  previous: Sources["upstream"],
): Promise<Sources["upstream"]> => {
  const out: Sources["upstream"] = {};
  for (const file of UPSTREAM_FILES) {
    let commit: GithubCommit;
    let tag: string | undefined;
    if (file.track === "tag") {
      const release = await githubApi(
        `repos/${file.repo}/releases/latest`,
        githubReleaseSchema,
      );
      tag = release.tag_name;
      commit = await githubApi(
        `repos/${file.repo}/commits/${encodeURIComponent(tag)}`,
        githubCommitSchema,
      );
    } else {
      commit = await latestCommitFor(file.repo, file.path);
    }
    const old = previous[file.id];
    if (
      old &&
      old.commit === commit.sha &&
      old.path === file.path &&
      old.video?.path === file.videoPath
    ) {
      out[file.id] = old;
      continue;
    }
    const data = await fetchBytes(
      githubRawUrl(file.repo, commit.sha, file.path),
    );
    const pin: UpstreamPin = {
      repo: file.repo,
      path: file.path,
      commit: commit.sha,
      date: day(commit.commit.committer.date),
      sha256: sha256(data),
    };
    if (tag) pin.tag = tag;
    if (file.videoPath) {
      const video = await fetchBytes(
        githubRawUrl(file.repo, commit.sha, file.videoPath),
      );
      pin.video = { path: file.videoPath, sha256: sha256(video) };
    }
    out[file.id] = pin;
  }
  return out;
};

const refreshHistory = async (
  repo: string,
  path: string,
  previous: CommitPin[],
  since: string | null,
  steamInfPath: string,
): Promise<CommitPin[]> => {
  const known = new Map(previous.map((pin) => [pin.commit, pin]));
  const query = `repos/${repo}/commits?path=${encodeURIComponent(path)}${since ? `&since=${since}T00:00:00Z` : ""}`;
  const commits = await githubApiPaged(query, githubCommitsSchema);
  const pins = await mapLimit(
    commits,
    4,
    async (commit): Promise<CommitPin | null> => {
      const old = known.get(commit.sha);
      if (old) return old;
      const data = await fetchBytes(githubRawUrl(repo, commit.sha, path));
      let build: number | null = null;
      try {
        build = clientVersion(
          decodeText(
            await fetchBytes(githubRawUrl(repo, commit.sha, steamInfPath)),
          ),
        );
      } catch {
        // Early GameTracking commits predate steam.inf; the message carries the build.
      }
      build ??= buildFromMessage(commit.commit.message);
      if (build === null) return null;
      return {
        commit: commit.sha,
        date: day(commit.commit.committer.date),
        build,
        sha256: sha256(data),
      };
    },
  );
  return pins
    .filter((pin): pin is CommitPin => pin !== null)
    .sort((a, b) => b.date.localeCompare(a.date) || b.build - a.build);
};

const describePinChanges = (before: Sources, after: Sources): string[] => {
  const changes: string[] = [];
  if (before.schemaExplorer.commit !== after.schemaExplorer.commit) {
    changes.push(
      `SchemaExplorer: revision ${before.schemaExplorer.revision} → ${after.schemaExplorer.revision} (${after.schemaExplorer.versionDate})`,
    );
  }
  const newStock = after.gameTracking.gameinfo.versions.filter(
    (pin) =>
      !before.gameTracking.gameinfo.versions.some(
        (old) => old.commit === pin.commit,
      ),
  );
  for (const pin of newStock)
    changes.push(`Stock gameinfo.gi: build ${pin.build} (${pin.date})`);
  const newDumps =
    after.gameTracking.convarHistory.versions.length -
    before.gameTracking.convarHistory.versions.length;
  if (newDumps > 0)
    changes.push(`Convar dump history: ${newDumps} new version(s)`);
  for (const [id, pin] of Object.entries(after.upstream)) {
    const old = before.upstream[id];
    if (!old)
      changes.push(`${id}: pinned ${pin.repo}@${pin.commit.slice(0, 12)}`);
    else if (old.commit !== pin.commit) {
      changes.push(
        `${id}: ${old.tag ?? old.commit.slice(0, 12)} → ${pin.tag ?? pin.commit.slice(0, 12)} (${pin.date})`,
      );
    }
  }
  for (const [id, pin] of Object.entries(after.community)) {
    const old = before.community[id];
    if (!old) changes.push(`GameBanana ${id}: pinned file ${pin.fileId}`);
    else if (old.fileId !== pin.fileId || old.md5 !== pin.md5) {
      changes.push(`GameBanana ${id}: file ${old.fileId} → ${pin.fileId}`);
    }
  }
  return changes;
};

/** Moves every pin to the newest upstream state. Returns the new sources and what moved. */
export const refreshSources = async (
  before: Sources,
): Promise<{ sources: Sources; changes: string[] }> => {
  const se = before.schemaExplorer;
  const seCommit = await latestCommitFor(se.repo, se.path);
  let schemaExplorer = se;
  if (seCommit.sha !== se.commit) {
    const data = await fetchBytes(githubRawUrl(se.repo, seCommit.sha, se.path));
    const header = schemaHeaderSchema.parse(JSON.parse(decodeText(data)));
    schemaExplorer = {
      ...se,
      commit: seCommit.sha,
      sha256: sha256(data),
      revision: header.revision,
      versionDate: header.version_date,
    };
  }

  const gt = before.gameTracking;
  const gameinfo = await refreshHistory(
    gt.repo,
    gt.gameinfo.path,
    gt.gameinfo.versions,
    null,
    gt.gameinfo.steamInf,
  );
  const convarHistory = await refreshHistory(
    gt.repo,
    gt.convarHistory.path,
    gt.convarHistory.versions,
    gt.convarHistory.since,
    gt.gameinfo.steamInf,
  );

  const community: Sources["community"] = {};
  for (const definition of COMMUNITY) {
    const id = String(definition.gamebananaId);
    const pin = await refreshCommunityPin(definition);
    const old = before.community[id];
    // Download counts move every day; only carry a change that matters so the
    // weekly refresh doesn't open a pull request for noise.
    const samePin =
      old &&
      old.fileId === pin.fileId &&
      old.md5 === pin.md5 &&
      old.updatedAt === pin.updatedAt;
    community[id] =
      samePin && Math.abs(pin.downloads - old.downloads) < old.downloads * 0.1
        ? old
        : pin;
  }

  const sources: Sources = {
    ...before,
    schemaExplorer,
    gameTracking: {
      ...gt,
      gameinfo: { ...gt.gameinfo, versions: gameinfo },
      convarHistory: { ...gt.convarHistory, versions: convarHistory },
    },
    upstream: await refreshUpstream(before.upstream),
    community,
  };
  return { sources, changes: describePinChanges(before, sources) };
};
