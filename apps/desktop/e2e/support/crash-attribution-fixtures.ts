import type { SessionReport } from "../../src/lib/launch-health/types";
import { reliabilityFixture } from "./reliability-fixtures";
const { PRIMARY, crashFingerprint } = reliabilityFixture;

export function crashReport(named: boolean): SessionReport {
  return {
    sessionId: named ? "fixture-resource-crash" : "fixture-generic-crash",
    startedAt: named ? "2026-10-31T12:05:00Z" : "2026-10-31T12:00:00Z",
    endedAt: null,
    uptimeSecs: 30,
    exitCode: 0xc0000005,
    exitCodeSource: "processHandle",
    classification: "crash",
    dump: {
      file: "fixture.dmp",
      reason: "error",
      exceptionCode: "0xC0000005",
      uptimeSecs: 30,
      addonCount: 1,
    },
    crashSuspect: named
      ? {
          resourcePath: "scripts/e2e-reliability.vdata_c",
          vpk: "pak01_dir.vpk",
          modId: PRIMARY.id,
          modName: PRIMARY.name,
        }
      : null,
    consoleClean: false,
    launchedByDmm: true,
    dmmStopped: false,
    buildChanged: false,
    recovered: false,
    fingerprint: crashFingerprint("changed"),
  };
}
