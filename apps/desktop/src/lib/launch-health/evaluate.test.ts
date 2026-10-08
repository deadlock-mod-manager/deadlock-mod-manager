import { describe, expect, it } from "bun:test";
import { diffFingerprints, evaluateSession, planReports } from "./evaluate";
import type { ClientModRef, SessionFingerprint, SessionReport } from "./types";

const mod = (remoteId: string, overrides: Partial<ClientModRef> = {}) => ({
  remoteId,
  name: `Mod ${remoteId}`,
  downloadedAt: "2026-10-01T10:00:00.000Z",
  variant: null,
  enabledAt: "2026-10-01T10:00:00.000Z",
  ...overrides,
});

const baseline: SessionFingerprint = {
  clientVersion: 6417,
  steamBuildId: "20412345",
  launchArgs: ["-console", "-condebug"],
  condebug: true,
  autoexecHash: "aaaa",
  addonPaths: [
    { path: "citadel/addons/profile_default", vpkCount: 2, digest: "d1" },
  ],
  perfConfig: null,
  client: {
    profileId: "default",
    profileName: "Default Profile",
    mods: [mod("a"), mod("b")],
  },
};

const fingerprint = (
  overrides: Partial<SessionFingerprint> = {},
): SessionFingerprint => ({ ...baseline, ...overrides });

const optiLock = {
  configId: "preset:optilock-potato",
  rev: "0123456789ab",
  name: "OptiLock Potato",
  appliedAt: "2026-10-08T10:00:00.000Z",
  settingCount: 425,
};

const report = (overrides: Partial<SessionReport> = {}): SessionReport => ({
  sessionId: "s1",
  startedAt: "2026-10-08T12:00:00+00:00",
  endedAt: "2026-10-08T12:00:41+00:00",
  uptimeSecs: 41,
  exitCode: 0xc0000005,
  exitCodeSource: "processHandle",
  classification: "crash",
  dump: null,
  consoleClean: false,
  launchedByDmm: true,
  dmmStopped: false,
  buildChanged: false,
  recovered: false,
  fingerprint: fingerprint({ perfConfig: optiLock }),
  ...overrides,
});

describe("diffFingerprints", () => {
  it("finds nothing between identical setups", () => {
    expect(diffFingerprints(baseline, fingerprint())).toEqual([]);
  });

  it("tells a new config from a switch and an edit", () => {
    expect(
      diffFingerprints(baseline, fingerprint({ perfConfig: optiLock })),
    ).toEqual([{ kind: "perfConfig", change: "turnedOn", config: optiLock }]);

    const other = { ...optiLock, configId: "preset:dmm-clean" };
    expect(
      diffFingerprints(
        fingerprint({ perfConfig: other }),
        fingerprint({ perfConfig: optiLock }),
      )[0],
    ).toMatchObject({ change: "switched" });

    expect(
      diffFingerprints(
        fingerprint({ perfConfig: { ...optiLock, rev: "ffffffffffff" } }),
        fingerprint({ perfConfig: optiLock }),
      )[0],
    ).toMatchObject({ change: "edited" });
  });

  it("does not count turning a config off", () => {
    expect(
      diffFingerprints(fingerprint({ perfConfig: optiLock }), baseline),
    ).toEqual([]);
  });

  it("lists added and updated mods but not removed ones", () => {
    const current = fingerprint({
      addonPaths: [
        { path: "citadel/addons/profile_default", vpkCount: 3, digest: "d2" },
      ],
      client: {
        profileId: "default",
        profileName: "Default Profile",
        mods: [
          mod("b", { downloadedAt: "2026-10-08T09:00:00.000Z" }),
          mod("c"),
        ],
      },
    });

    expect(diffFingerprints(baseline, current)).toEqual([
      { kind: "modsAdded", mods: [mod("c")] },
      {
        kind: "modsUpdated",
        mods: [mod("b", { downloadedAt: "2026-10-08T09:00:00.000Z" })],
      },
    ]);
  });

  it("reports changed addon files only when no mod change explains them", () => {
    const current = fingerprint({
      addonPaths: [
        { path: "citadel/addons/profile_default", vpkCount: 2, digest: "d9" },
      ],
    });

    expect(diffFingerprints(baseline, current)).toEqual([
      { kind: "addonFiles", paths: ["citadel/addons/profile_default"] },
    ]);
  });

  it("reports autoexec and launch option changes", () => {
    const current = fingerprint({
      autoexecHash: "bbbb",
      launchArgs: ["-console", "-dx12"],
    });

    expect(diffFingerprints(baseline, current)).toEqual([
      { kind: "autoexec" },
      { kind: "launchOptions", added: ["-dx12"], removed: ["-condebug"] },
    ]);
  });
});

describe("evaluateSession", () => {
  it("takes a clean exit as the new baseline", () => {
    expect(
      evaluateSession(report({ classification: "clean" }), baseline),
    ).toEqual({ kind: "normal" });
  });

  it("asks about an early crash with a dialog", () => {
    const decision = evaluateSession(report(), baseline);

    expect(decision).toEqual({
      kind: "prompt",
      changes: [{ kind: "perfConfig", change: "turnedOn", config: optiLock }],
      buildChanged: false,
      modsLoaded: true,
      presentation: "dialog",
    });
  });

  it("uses a toast for weaker or older evidence", () => {
    expect(
      evaluateSession(report({ classification: "ambiguous" }), baseline),
    ).toMatchObject({ kind: "prompt", presentation: "toast" });
    expect(
      evaluateSession(report({ recovered: true }), baseline),
    ).toMatchObject({ kind: "prompt", presentation: "toast" });
  });

  it("ignores a short session the app stopped", () => {
    expect(
      evaluateSession(
        report({ classification: "stopped", exitCode: 1, uptimeSecs: 20 }),
        baseline,
      ),
    ).toEqual({ kind: "ignore", reason: "stoppedByApp" });
  });

  it("treats a long session the app stopped as normal", () => {
    expect(
      evaluateSession(
        report({ classification: "stopped", exitCode: 1, uptimeSecs: 3600 }),
        baseline,
      ),
    ).toEqual({ kind: "normal" });
  });

  it("does not blame changes for late or unexplained exits", () => {
    expect(evaluateSession(report({ uptimeSecs: 1800 }), baseline)).toEqual({
      kind: "ignore",
      reason: "longSession",
    });
    expect(
      evaluateSession(report({ classification: "unknown" }), baseline),
    ).toEqual({ kind: "ignore", reason: "noSignal" });
    expect(evaluateSession(report({ uptimeSecs: null }), baseline)).toEqual({
      kind: "ignore",
      reason: "noSignal",
    });
  });

  it("treats a long session that ended oddly as normal", () => {
    expect(
      evaluateSession(
        report({ classification: "ambiguous", uptimeSecs: 3600 }),
        baseline,
      ),
    ).toEqual({ kind: "normal" });
    expect(
      evaluateSession(
        report({ classification: "unknown", uptimeSecs: 3600 }),
        baseline,
      ),
    ).toEqual({ kind: "normal" });
  });

  it("needs a baseline and a change to ask", () => {
    expect(evaluateSession(report(), null)).toEqual({
      kind: "ignore",
      reason: "noBaseline",
    });
    expect(
      evaluateSession(report({ fingerprint: fingerprint() }), baseline),
    ).toEqual({ kind: "ignore", reason: "noChanges" });
  });

  it("leaves mods out when none were mounted", () => {
    const vanilla = fingerprint({
      addonPaths: [],
      perfConfig: optiLock,
      client: {
        profileId: "default",
        profileName: "Default Profile",
        mods: [mod("a"), mod("b"), mod("c")],
      },
    });

    expect(
      evaluateSession(report({ fingerprint: vanilla }), baseline),
    ).toMatchObject({
      kind: "prompt",
      modsLoaded: false,
      changes: [{ kind: "perfConfig" }],
    });
  });

  it("notices a game update since the last normal session", () => {
    expect(
      evaluateSession(
        report({
          fingerprint: fingerprint({
            perfConfig: optiLock,
            clientVersion: 6418,
          }),
        }),
        baseline,
      ),
    ).toMatchObject({ kind: "prompt", buildChanged: true });
  });
});

describe("planReports", () => {
  const crash = report({
    sessionId: "crash",
    startedAt: "2026-10-08T12:00:00Z",
  });
  const clean = report({
    sessionId: "clean",
    startedAt: "2026-10-08T13:00:00Z",
    classification: "clean",
  });

  it("promotes normal sessions and asks about the latest crash", () => {
    const plan = planReports([crash], baseline, new Set());

    expect(plan.prompt?.report.sessionId).toBe("crash");
    expect(plan.acknowledgements).toEqual([]);
    expect(plan.newBaseline).toBeNull();
  });

  it("drops a crash once a normal session followed it", () => {
    const plan = planReports([clean, crash], baseline, new Set());

    expect(plan.prompt).toBeNull();
    expect(plan.newBaseline).toEqual(clean.fingerprint);
    expect(plan.acknowledgements).toEqual([
      { sessionId: "crash", outcome: "superseded" },
      { sessionId: "clean", outcome: "normal" },
    ]);
  });

  it("only asks about the newest of several crashes", () => {
    const later = report({
      sessionId: "later",
      startedAt: "2026-10-08T12:10:00Z",
    });
    const plan = planReports([later, crash], baseline, new Set());

    expect(plan.prompt?.report.sessionId).toBe("later");
    expect(plan.acknowledgements).toEqual([
      { sessionId: "crash", outcome: "superseded" },
    ]);
  });

  it("keeps the baseline and the prompt when the app stops a session", () => {
    const stopped = report({
      sessionId: "stopped",
      startedAt: "2026-10-08T12:30:00Z",
      classification: "stopped",
      fingerprint: fingerprint({ perfConfig: optiLock }),
    });
    const plan = planReports([crash, stopped], baseline, new Set());

    expect(plan.prompt?.report.sessionId).toBe("crash");
    expect(plan.newBaseline).toBeNull();
    expect(plan.acknowledgements).toEqual([
      { sessionId: "stopped", outcome: "ignored" },
    ]);
  });

  it("never asks twice about the same session", () => {
    const plan = planReports([crash], baseline, new Set(["crash"]));

    expect(plan.prompt).toBeNull();
    expect(plan.acknowledgements).toEqual([
      { sessionId: "crash", outcome: "ignored" },
    ]);
  });
});
