import type {
  ClientModRef,
  CrashCheckDecision,
  SessionAckOutcome,
  SessionChange,
  SessionFingerprint,
  SessionReport,
} from "./types";

/**
 * Only an early exit points at the setup. Later crashes happen to any setup,
 * and plenty of normal sessions are short too, so this decides whether to
 * blame recent changes, not whether something crashed.
 */
const CRASH_WINDOW_SECONDS = 300;

const modFilesChanged = (previous: ClientModRef, current: ClientModRef) =>
  previous.downloadedAt !== current.downloadedAt ||
  previous.variant !== current.variant;

const perfConfigChange = (
  previous: SessionFingerprint,
  current: SessionFingerprint,
): SessionChange | null => {
  const config = current.perfConfig;
  if (!config) return null;
  const before = previous.perfConfig;
  if (!before) return { kind: "perfConfig", change: "turnedOn", config };
  if (before.configId !== config.configId) {
    return { kind: "perfConfig", change: "switched", config };
  }
  if (before.rev !== config.rev) {
    return { kind: "perfConfig", change: "edited", config };
  }
  return null;
};

const modChanges = (
  previous: SessionFingerprint,
  current: SessionFingerprint,
): SessionChange[] => {
  if (!previous.client || !current.client) return [];
  const before = new Map(
    previous.client.mods.map((mod) => [mod.remoteId, mod]),
  );
  const added = current.client.mods.filter((mod) => !before.has(mod.remoteId));
  const updated = current.client.mods.filter((mod) => {
    const previousMod = before.get(mod.remoteId);
    return previousMod !== undefined && modFilesChanged(previousMod, mod);
  });
  const changes: SessionChange[] = [];
  if (added.length > 0) changes.push({ kind: "modsAdded", mods: added });
  if (updated.length > 0) changes.push({ kind: "modsUpdated", mods: updated });
  return changes;
};

const changedAddonPaths = (
  previous: SessionFingerprint,
  current: SessionFingerprint,
): string[] => {
  const before = new Map(
    previous.addonPaths.map((path) => [path.path, path.digest]),
  );
  return current.addonPaths
    .filter((path) => before.get(path.path) !== path.digest)
    .map((path) => path.path);
};

const launchOptionsChange = (
  previous: SessionFingerprint,
  current: SessionFingerprint,
): SessionChange | null => {
  const added = current.launchArgs.filter(
    (argument) => !previous.launchArgs.includes(argument),
  );
  const removed = previous.launchArgs.filter(
    (argument) => !current.launchArgs.includes(argument),
  );
  if (added.length === 0 && removed.length === 0) return null;
  return { kind: "launchOptions", added, removed };
};

/**
 * What the session ran with that the last normal session didn't. Removals
 * are left out (turning things off doesn't break a launch), except inside
 * launch options, where a removed argument can matter.
 */
export const diffFingerprints = (
  previous: SessionFingerprint,
  current: SessionFingerprint,
): SessionChange[] => {
  const changes: SessionChange[] = [];
  const perfConfig = perfConfigChange(previous, current);
  if (perfConfig) changes.push(perfConfig);

  const mods = modChanges(previous, current);
  changes.push(...mods);

  if (
    current.autoexecHash !== null &&
    current.autoexecHash !== previous.autoexecHash
  ) {
    changes.push({ kind: "autoexec" });
  }

  const launchOptions = launchOptionsChange(previous, current);
  if (launchOptions) changes.push(launchOptions);

  // Without a mod-level change to point at, still say when the mounted files
  // changed (a reorder, a file swapped by hand, another tool).
  if (mods.length === 0) {
    const paths = changedAddonPaths(previous, current);
    if (paths.length > 0) changes.push({ kind: "addonFiles", paths });
  }
  return changes;
};

const MOD_CHANGE_KINDS = new Set<SessionChange["kind"]>([
  "modsAdded",
  "modsUpdated",
  "addonFiles",
]);

export const modsWereLoaded = (fingerprint: SessionFingerprint): boolean =>
  fingerprint.addonPaths.some((path) => path.vpkCount > 0);

const buildDiffers = (
  previous: SessionFingerprint,
  current: SessionFingerprint,
): boolean =>
  (previous.clientVersion !== null &&
    current.clientVersion !== null &&
    previous.clientVersion !== current.clientVersion) ||
  (previous.steamBuildId !== null &&
    current.steamBuildId !== null &&
    previous.steamBuildId !== current.steamBuildId);

export const evaluateSession = (
  report: SessionReport,
  lastNormal: SessionFingerprint | null,
): CrashCheckDecision => {
  if (report.classification === "clean") return { kind: "normal" };

  const uptime = report.uptimeSecs;
  const ranAWhile = uptime !== null && uptime >= CRASH_WINDOW_SECONDS;
  // A stop from the app says nothing about a crash. A short stopped session
  // may be a hang, so it must not become the setup later crashes are compared
  // against; one that ran a while is a normal session cut short.
  if (report.classification === "stopped") {
    return ranAWhile
      ? { kind: "normal" }
      : { kind: "ignore", reason: "stoppedByApp" };
  }
  // We can't tell how these ended, but the setup ran for a good while.
  if (report.classification !== "crash" && ranAWhile) {
    return { kind: "normal" };
  }
  if (report.classification === "unknown" || uptime === null) {
    return { kind: "ignore", reason: "noSignal" };
  }
  if (ranAWhile) return { kind: "ignore", reason: "longSession" };
  if (!lastNormal) return { kind: "ignore", reason: "noBaseline" };

  const modsLoaded = modsWereLoaded(report.fingerprint);
  const changes = diffFingerprints(lastNormal, report.fingerprint).filter(
    (change) => modsLoaded || !MOD_CHANGE_KINDS.has(change.kind),
  );
  if (changes.length === 0) return { kind: "ignore", reason: "noChanges" };

  return {
    kind: "prompt",
    changes,
    buildChanged:
      report.buildChanged || buildDiffers(lastNormal, report.fingerprint),
    modsLoaded,
    presentation:
      report.classification === "crash" && !report.recovered
        ? "dialog"
        : "toast",
  };
};

export type CrashCheckPrompt = {
  report: SessionReport;
  decision: Extract<CrashCheckDecision, { kind: "prompt" }>;
};

type ReportPlan = {
  acknowledgements: { sessionId: string; outcome: SessionAckOutcome }[];
  /** The newest normal session's fingerprint, if any. */
  newBaseline: SessionFingerprint | null;
  prompt: CrashCheckPrompt | null;
};

/**
 * Works through finished sessions oldest first. Only the latest crash is worth
 * asking about, and not once a normal session has followed it.
 */
export const planReports = (
  reports: SessionReport[],
  lastNormal: SessionFingerprint | null,
  acknowledgedIds: ReadonlySet<string>,
): ReportPlan => {
  const plan: ReportPlan = {
    acknowledgements: [],
    newBaseline: null,
    prompt: null,
  };
  let baseline = lastNormal;
  const acknowledge = (sessionId: string, outcome: SessionAckOutcome) =>
    plan.acknowledgements.push({ sessionId, outcome });
  const supersedePrompt = () => {
    if (!plan.prompt) return;
    acknowledge(plan.prompt.report.sessionId, "superseded");
    plan.prompt = null;
  };

  const ordered = [...reports].sort((a, b) =>
    a.startedAt.localeCompare(b.startedAt),
  );
  for (const report of ordered) {
    if (acknowledgedIds.has(report.sessionId)) {
      acknowledge(report.sessionId, "ignored");
      continue;
    }
    const decision = evaluateSession(report, baseline);
    switch (decision.kind) {
      case "normal":
        supersedePrompt();
        baseline = report.fingerprint;
        plan.newBaseline = report.fingerprint;
        acknowledge(report.sessionId, "normal");
        break;
      case "ignore":
        acknowledge(report.sessionId, "ignored");
        break;
      case "prompt":
        supersedePrompt();
        plan.prompt = { report, decision };
        break;
    }
  }
  return plan;
};
