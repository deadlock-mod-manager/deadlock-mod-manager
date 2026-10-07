#!/usr/bin/env bun
// Blocks until something on a pull request needs the agent, then prints one
// JSON line describing it and exits. Polls GitHub through the `gh` CLI.
//
//   bun watch.ts <pr> [--since <iso>] [--interval 60] [--max-minutes 55]
//                     [--ignore <check-regex>] [--ignore-authors <login-regex>]
//                     [--events <list>]
//
// Pass the previous event's `at` as --since when re-arming, so feedback posted
// while the agent was busy still wakes it.
//
// --events limits which events wake it (closed, timeout and error always do).
// Use `--events checks-complete` next to a native watch that already covers
// failures, feedback and conflicts.
//
// Exit reasons: closed, head-changed, conflict, check-failed, checks-complete,
// feedback, timeout, error. Run it again after handling the event.
import { $ } from "bun";
import { parseArgs } from "node:util";

type Bucket = "pass" | "fail" | "pending" | "skipping" | "cancel";
type Check = { name: string; bucket: Bucket; link: string };
type Feedback = { who: string; at: string; kind: string };
type Snapshot = {
  state: "OPEN" | "CLOSED" | "MERGED";
  headRefOid: string;
  mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
  feedback: Feedback[];
  checks: Check[];
};

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {
    since: { type: "string" },
    interval: { type: "string", default: "60" },
    "max-minutes": { type: "string", default: "55" },
    ignore: { type: "string", default: "^(CodeRabbit|Vercel)" },
    // Status bots that post on every push but never ask for a change.
    "ignore-authors": { type: "string", default: "^(vercel|changeset-bot|github-actions|gitguardian|netlify)" },
    events: { type: "string" },
  },
});

const pr = positionals.find((a) => /^\d+$/.test(a));
if (!pr) {
  console.error("usage: bun watch.ts <pr> [--since <iso>] [--interval 60] [--max-minutes 55] [--events <list>]");
  process.exit(2);
}
const intervalMs = Number(values.interval) * 1000;
const deadline = Date.now() + Number(values["max-minutes"]) * 60_000;
const ignore = new RegExp(values.ignore!, "i");
const quietAuthors = new RegExp(values["ignore-authors"]!, "i");
const only = values.events?.split(",");

function emit(event: string, detail: Record<string, unknown> = {}): void {
  if (only && !only.includes(event) && !["error", "timeout", "closed"].includes(event)) return;
  console.log(JSON.stringify({ event, pr: Number(pr), at: new Date().toISOString(), ...detail }));
  process.exit(0);
}

class GhError extends Error {}

async function gh<T>(cmd: ReturnType<typeof $>): Promise<T> {
  const r = await cmd.nothrow().quiet();
  if (r.exitCode !== 0) throw new GhError(r.stderr.toString().trim() || `gh exited ${r.exitCode}`);
  return JSON.parse(r.stdout.toString());
}

async function checks(): Promise<Check[]> {
  // `gh pr checks` exits non-zero when checks fail or are pending, and errors
  // with "no checks reported" before a new head's checks register.
  const r = await $`gh pr checks ${pr} --json name,bucket,link`.nothrow().quiet();
  const out = r.stdout.toString().trim();
  if (out.startsWith("[")) return JSON.parse(out);
  if (/no checks reported/i.test(r.stderr.toString())) return [];
  throw new GhError(r.stderr.toString().trim() || `gh exited ${r.exitCode}`);
}

const FEEDBACK = `query($owner:String!,$name:String!,$pr:Int!){
  viewer{login}
  repository(owner:$owner,name:$name){pullRequest(number:$pr){
    comments(last:30){nodes{author{login} createdAt}}
    reviews(last:30){nodes{author{login} state submittedAt}}
    reviewThreads(last:100){nodes{comments(last:5){nodes{author{login} createdAt}}}}
  }}}`;

type Author = { author: { login: string } | null };
type FeedbackData = {
  data: {
    viewer: { login: string };
    repository: {
      pullRequest: {
        comments: { nodes: (Author & { createdAt: string })[] };
        reviews: { nodes: (Author & { state: string; submittedAt: string | null })[] };
        reviewThreads: { nodes: { comments: { nodes: (Author & { createdAt: string })[] } }[] };
      };
    };
  };
};

async function snapshot(owner: string, name: string): Promise<Snapshot> {
  const [view, { data }, current] = await Promise.all([
    gh<Omit<Snapshot, "feedback" | "checks">>($`gh pr view ${pr} --json state,headRefOid,mergeable`),
    gh<FeedbackData>(
      $`gh api graphql -f ${`query=${FEEDBACK}`} -F ${`owner=${owner}`} -F ${`name=${name}`} -F ${`pr=${pr}`}`,
    ),
    checks(),
  ]);
  const p = data.repository.pullRequest;
  // The agent posts as the user, so the viewer's own replies are not new feedback.
  const feedback = [
    ...p.comments.nodes.map((c) => ({ who: c.author?.login, at: c.createdAt, kind: "comment" })),
    ...p.reviews.nodes.map((r) => ({ who: r.author?.login, at: r.submittedAt, kind: `review:${r.state}` })),
    ...p.reviewThreads.nodes.flatMap((t) =>
      t.comments.nodes.map((c) => ({ who: c.author?.login, at: c.createdAt, kind: "thread" })),
    ),
  ].filter(
    (f): f is Feedback => !!f.who && !!f.at && f.who !== data.viewer.login && !quietAuthors.test(f.who),
  );
  return { ...view, feedback, checks: current };
}

let url = "";
try {
  ({ url } = await gh<{ url: string }>($`gh pr view ${pr} --json url`));
} catch (e) {
  emit("error", { message: (e as Error).message.slice(0, 500) });
}
const [, owner, name] = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull/)!;

let base: (Snapshot & { since: string }) | undefined;
let sawPending = false;
let failures = 0;
const seenFailed = new Set<string>();

while (true) {
  let s: Snapshot;
  try {
    s = await snapshot(owner, name);
    failures = 0;
  } catch (e) {
    if (++failures >= 5) emit("error", { message: (e as Error).message.slice(0, 500) });
    await Bun.sleep(intervalMs);
    continue;
  }

  const gating = s.checks.filter((c) => !ignore.test(c.name));
  const complete = gating.length > 0 && gating.every((c) => c.bucket !== "pending");

  if (!base) {
    // The agent read the PR before arming, so state present at start is not news:
    // only failures, feedback and completion that appear afterwards wake it.
    const latest = s.feedback.reduce((max, f) => (f.at > max ? f.at : max), "");
    base = { ...s, since: values.since ?? latest };
    for (const c of gating) if (c.bucket === "fail") seenFailed.add(c.name);
  }

  if (s.state !== "OPEN") emit("closed", { state: s.state });
  if (s.headRefOid !== base.headRefOid) emit("head-changed", { from: base.headRefOid, to: s.headRefOid });
  if (s.mergeable === "CONFLICTING") emit("conflict");

  const fresh = s.feedback.filter((f) => f.at > base!.since);
  if (fresh.length) emit("feedback", { items: fresh });

  // A rerun that turns checks pending again counts, even if all were done at start.
  if (!complete) sawPending = true;

  const failed = gating.filter((c) => c.bucket === "fail" && !seenFailed.has(c.name));
  if (failed.length) emit("check-failed", { head: s.headRefOid, checks: failed });

  // An empty list means the head's checks have not registered yet; keep waiting.
  if (complete && sawPending) {
    const summary: Record<string, number> = {};
    for (const c of gating) summary[c.bucket] = (summary[c.bucket] ?? 0) + 1;
    emit("checks-complete", {
      head: s.headRefOid,
      summary,
      failing: gating.filter((c) => c.bucket === "fail").map((c) => c.name),
    });
  }

  if (Date.now() > deadline) emit("timeout", { head: s.headRefOid });
  await Bun.sleep(intervalMs);
}
