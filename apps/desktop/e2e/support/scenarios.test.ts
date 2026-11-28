import { YAML } from "bun";
import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { z } from "zod";
import {
  parseScenarioId,
  scenarioPhases,
  scenarioSpec,
  selectScenarios,
  scenarios,
  criticalScenarios,
} from "./scenarios";

// Legacy native-input cases and filesystem-lock are Windows-only.
const windows = process.platform === "win32";

describe("scenario selection", () => {
  it("runs critical recovery cases without expanding to every family", () => {
    const selected = selectScenarios("critical", "win32");
    expect(new Set(selected)).toEqual(new Set(criticalScenarios));
    expect(selected).toHaveLength(8);
    expect(selected).toContain("gamebanana-file-toggle");
    expect(selected).toContain("gamebanana-reinstall-readonly");
    expect(selected).toContain("profiles-restore-during-sync");
    expect(selected).toContain("filesystem-crash-placed");
    expect(selected).toContain("filesystem-crash-committed");
    expect(selected).not.toContain("monkey");
    expect(scenarioPhases("filesystem-crash-placed")).toContain("mutate");
    expect(scenarios["filesystem-crash-placed"].exit("mutate")).toBe("crash");
  });

  it("fails the required CI gate for failed, cancelled, or unexpectedly skipped coverage", async () => {
    const { jobs } = z
      .object({
        jobs: z.object({
          "static-checks": z.object({
            steps: z.array(z.object({ run: z.string().optional() })),
          }),
          "desktop-critical": z.object({
            needs: z.string(),
            if: z.string(),
            uses: z.string(),
            with: z.object({
              required: z.boolean(),
              platforms: z.string(),
              suites: z.string(),
            }),
          }),
          "check-types": z.object({
            name: z.string(),
            needs: z.array(z.string()),
            if: z.string(),
            steps: z.array(z.object({ shell: z.string(), run: z.string() })),
          }),
        }),
      })
      .parse(
        YAML.parse(
          await readFile(
            new URL("../../../../.github/workflows/ci.yml", import.meta.url),
            "utf8",
          ),
        ),
      );
    const gate = jobs["check-types"];
    expect(gate.name).toBe("Type Check");
    expect(gate.needs).toEqual(["static-checks", "desktop-critical"]);
    expect(gate.if).toBe("always()");
    expect(jobs["desktop-critical"].needs).toBe("static-checks");
    expect(jobs["desktop-critical"].if).toBe(
      "needs.static-checks.outputs.desktop == 'true'",
    );
    expect(jobs["desktop-critical"].uses).toBe(
      "./.github/workflows/desktop-e2e.yml",
    );
    expect(jobs["desktop-critical"].with).toEqual({
      required: true,
      platforms: "windows",
      suites: '["critical"]',
    });
    expect(jobs["static-checks"].steps.map((step) => step.run)).toEqual(
      expect.arrayContaining(["pnpm lint", "pnpm format:check"]),
    );
    const step = gate.steps[0];
    if (!step) throw new Error("Required gate step missing");
    expect(step.shell).toBe("node {0}");
    const outcomes: [string, string, string, number][] = [
      ["success", "true", "success", 0],
      ["success", "false", "skipped", 0],
      ["failure", "false", "skipped", 1],
      ["cancelled", "true", "success", 1],
      ["skipped", "false", "skipped", 1],
      ["success", "true", "failure", 1],
      ["success", "true", "cancelled", 1],
      ["success", "true", "skipped", 1],
      ["success", "", "skipped", 1],
    ];
    for (const [staticResult, required, desktopResult, exitCode] of outcomes) {
      const processFixture = {
        env: {
          STATIC_RESULT: staticResult,
          DESKTOP_REQUIRED: required,
          DESKTOP_RESULT: desktopResult,
        },
        exitCode: 0,
      };
      runInNewContext(step.run, {
        process: processFixture,
        console: { error: () => {} },
      });
      expect(processFixture.exitCode).toBe(exitCode);
    }
  });

  it("registers every case with explicit phases and capability requirements", () => {
    const ids = selectScenarios("all");
    expect(ids).toHaveLength(windows ? 190 : 180);
    expect(ids).toContain("downloads-segmented-range-error");
    // Some of these specs don't dispatch on their case ID, so a rename
    // wouldn't fail them.
    expect(ids).toEqual(
      expect.arrayContaining([
        "compatibility-rebuild-after-close",
        "compatibility-rebuild-restart",
        "compatibility-rebuild-steam-rewrite",
        "compatibility-rebuild-game-update",
        "compatibility-rebuild-app-update",
        "compatibility-rebuild-new-data",
      ]),
    );
    for (const id of ids) {
      expect(parseScenarioId(id)).toBe(id);
      expect(scenarioSpec(id)).toContain("./specs/");
      expect(new Set(scenarioPhases(id)).size).toBe(scenarioPhases(id).length);
    }
    expect(selectScenarios("onboarding")).toEqual([
      "onboarding-skip-analysis",
      "onboarding-telemetry-default",
      "onboarding-identified-addon",
    ]);
    expect(selectScenarios("gamebanana")).toHaveLength(36);
    expect(selectScenarios("gamebanana")).toContain(
      "gamebanana-switch-reinstall",
    );
    expect(selectScenarios("gamebanana")).toContain(
      "gamebanana-reinstall-readonly",
    );
    expect(scenarioSpec("mod-files-error")).toBe(
      "./specs/mod-files-error.e2e.ts",
    );
    expect(scenarioPhases("mod-files-error")).toEqual(["files-error"]);
    expect(selectScenarios("profiles")).toContain("profiles-restore-variant");
    expect(selectScenarios("profiles-restore-variant")).toEqual([
      "profiles-restore-variant",
    ]);
    expect(scenarioPhases("profiles-restore-variant")).toEqual([
      "restore-variant",
      "restart-restored-variant",
    ]);
    expect(selectScenarios("library-groups")).toEqual([
      "library-groups-organize",
      "library-groups-identification",
      "library-groups-pagination",
      "library-groups-removal",
      "library-groups-drag",
      "library-groups-toggle",
    ]);
    expect(scenarios["library-groups-drag"].nativeInput).toBe(true);
    expect(scenarios["library-groups-drag"].platforms).toContain("linux");
    expect(selectScenarios("monkey")).toEqual(["monkey"]);
    expect(selectScenarios("performance")).toEqual([
      "perf-video-apply-restore",
      "perf-video-changed-in-game",
      "perf-video-adopt",
      "perf-video-variant",
      "perf-gameinfo-resync",
      "perf-gameinfo-launch",
      "perf-editor-undo",
      "perf-import-paste",
    ]);
    expect(selectScenarios("diagnostics")).toEqual([
      "network-diagnostics",
      "network-diagnostics-internet-down",
    ]);
    expect(selectScenarios("updater")).toEqual([
      "app-update-download",
      "app-update-check-failure",
    ]);
    expect(scenarios.monkey.nativeInput).toBe(false);
    expect(selectScenarios("filesystem")).toHaveLength(windows ? 14 : 12);
    for (const id of [
      "gameinfo-preserve-search-paths",
      "gameinfo-preserve-legacy-search-paths",
    ]) {
      const scenario = parseScenarioId(id);
      expect(scenarioPhases(scenario)).toEqual([
        "preserve",
        "restart-preserve",
      ]);
      expect(scenarioSpec(scenario)).toBe(
        "./specs/gameinfo-preservation.e2e.ts",
      );
    }
    expect(selectScenarios("interchange")).toEqual(["grimoire-import"]);
    expect(selectScenarios("analyze")).toEqual(["analyze-errors"]);
    expect(selectScenarios("skins")).toEqual([
      "hero-skins-active",
      "foundry-workspace-failure",
      "foundry-revert-failure",
    ]);
    expect(selectScenarios("stats")).toEqual([
      "stats-default-layout",
      "stats-arrange-widgets",
      "stats-custom-tabs",
      "stats-custom-queries",
      "stats-season-filter",
      "stats-broken-endpoints",
      "stats-items-error",
    ]);
    expect(selectScenarios("shards")).toEqual([
      "shards-library",
      "shards-conflicts",
    ]);
    expect(selectScenarios("missing-vpks")).toEqual([
      "missing-vpks-launch",
      "missing-vpks-launch-partial",
      "missing-vpks-launch-relaunch-error",
      "missing-vpks-launch-relaunch-missing",
      "missing-vpks-offline",
      "missing-vpks-live",
    ]);
    expect(scenarios["profiles-pointer"].nativeInput).toBe(true);
    expect(scenarios["filesystem-manifest-repair"].nativeInput).toBe(false);
    expect(scenarioPhases("filesystem-mod-folder-repair")).toEqual([
      "repair-folder",
      "restart-folder",
      "restart-restored-folder",
    ]);
    expect(scenarios["filesystem-mod-folder-repair"].nativeInput).toBe(false);
    expect(scenarios["conflicts-resolve"].nativeInput).toBe(false);
    expect(scenarios["conflicts-switch"].nativeInput).toBe(false);
    expect(scenarioPhases("downloads-queue-error-model-tab")).toEqual([
      "model-tab",
    ]);
    expect(scenarios["filesystem-crash-placed"].exit("mutate")).toBe("crash");
    expect(scenarios["filesystem-manifest-repair"].exit("repair")).toBe(
      "normal",
    );
    expect(scenarios["downloads-restart"].exit("transfer")).toBe("interrupt");
    expect(scenarios["downloads-segmented-restart"].exit("transfer")).toBe(
      "interrupt",
    );
    expect(() => selectScenarios("not-a-suite")).toThrow();
  });
  it("keeps the smoke as default and rejects arbitrary spec paths", () => {
    expect(parseScenarioId()).toBe("about-smoke");
    expect(() => parseScenarioId("../../outside.ts")).toThrow(
      "Unsupported E2E case",
    );
  });

  it("runs the lifecycle in two fresh processes against one world", () => {
    expect(scenarioPhases("local-mod-name-recovery")).toEqual([
      "import",
      "restart-delete",
    ]);
    expect(scenarios["local-mod-name-recovery"].nativeInput).toBe(false);
    expect(scenarios["local-mod-name-recovery"].platforms).toContain("linux");
    expect(scenarioPhases("local-mod-lifecycle")).toEqual([
      "import-toggle",
      "restart-delete",
    ]);
    expect(scenarioSpec("local-mod-lifecycle")).toBe(
      "./specs/local-mod-lifecycle.e2e.ts",
    );
    expect(scenarioPhases("about-smoke")).toEqual(["smoke"]);
  });

  it("only registers Windows-only cases on Windows", () => {
    const windowsOnly = [
      "local-mod-lifecycle",
      "profiles-pointer",
      "profiles-keyboard",
      "filesystem-lock",
    ] as const;
    for (const id of windowsOnly) {
      expect(scenarios[id].platforms).toEqual(["win32"]);
      expect(selectScenarios("all").includes(id)).toBe(windows);
      if (windows) expect(parseScenarioId(id)).toBe(id);
      else expect(() => parseScenarioId(id)).toThrow("supports win32");
    }
  });

  // Pull requests skip Desktop E2E, so a case outside these lists never runs
  // upstream.
  it("schedules every case in a default CI job", async () => {
    const { jobs } = z
      .object({
        jobs: z.object({
          // Strict, so a matrix key this check doesn't read fails it.
          scenarios: z.object({
            strategy: z.object({
              matrix: z.strictObject({
                suite: z.string(),
                include: z.string(),
              }),
            }),
          }),
          "linux-scenarios": z.object({
            strategy: z.object({
              matrix: z.strictObject({
                distro: z.array(z.string()),
                suite: z.array(z.string()),
                include: z.array(z.object({ suite: z.string().optional() })),
                exclude: z.array(
                  z.object({ distro: z.string(), suite: z.string() }),
                ),
              }),
            }),
          }),
        }),
      })
      .parse(
        YAML.parse(
          await readFile(
            new URL(
              "../../../../.github/workflows/desktop-e2e.yml",
              import.meta.url,
            ),
            "utf8",
          ),
        ),
      );
    // The Windows default is the fallback inside the matrix expression.
    const windows = z
      .array(z.string())
      .parse(
        JSON.parse(
          /'(\[.*\])'/.exec(jobs.scenarios.strategy.matrix.suite)?.[1] ??
            "null",
        ),
      );
    const linux = jobs["linux-scenarios"].strategy.matrix;
    const scheduled = new Set<string>([
      ...windows.flatMap((suite) => selectScenarios(suite, "win32")),
      ...[
        ...linux.suite.filter((suite) =>
          linux.distro.some(
            (distro) =>
              !linux.exclude.some(
                (job) => job.distro === distro && job.suite === suite,
              ),
          ),
        ),
        ...linux.include.flatMap((job) => job.suite ?? []),
      ].flatMap((suite) => selectScenarios(suite, "linux")),
    ]);
    expect(Object.keys(scenarios).filter((id) => !scheduled.has(id))).toEqual(
      [],
    );
  });

  it("imports Grimoire, restarts, and re-imports changed source state", () => {
    expect(scenarioPhases("grimoire-import")).toEqual([
      "import",
      "restart-import",
      "reimport",
    ]);
    expect(scenarioSpec("grimoire-import")).toBe(
      "./specs/grimoire-import.e2e.ts",
    );
  });
});
