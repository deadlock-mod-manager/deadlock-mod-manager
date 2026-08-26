# Issue #640 Linux desktop measurement prototype

This is a throwaway, human-in-the-loop measurement harness for GitHub issue
[#640](https://github.com/deadlock-mod-manager/deadlock-mod-manager/issues/640).
It does not install either application package and it does not read or write the
normal Deadlock Mod Manager data directory.

The harness downloads and verifies the exact v1.1.0 and rolling-nightly Debian
packages, extracts them under the ignored `result/` directory, and launches each
with isolated XDG data/config/cache directories. Each run receives the same
synthetic library and records the entire app/WebKit process group's CPU, RSS,
process count, and `/proc` I/O counters every 250 ms.

## First CachyOS pass

Close any running Deadlock Mod Manager instance, then run from the repository
root:

```bash
bash apps/desktop/scripts/perf-prototype-640/hitl-linux.sh
```

The script starts with five measured samples so an exploratory pass stays
short. It will prompt you to open My Mods, open the WebKit inspector, and paste
`webview-probe.js` into the inspected page's console. The probe prints one line
beginning with `DMM_ISSUE_640_RESULT=`; paste the JSON portion back into the
terminal.

When an exploratory result crosses a materiality floor, rerun the affected
cases as two balanced decision-grade blocks. Block 2 reverses the artifact
order:

```bash
DMM_PERF_SAMPLES=20 DMM_PERF_BLOCK=1 bash apps/desktop/scripts/perf-prototype-640/hitl-linux.sh
DMM_PERF_SAMPLES=20 DMM_PERF_BLOCK=2 bash apps/desktop/scripts/perf-prototype-640/hitl-linux.sh
```

Results are written to `result/issue-640/runs/<UTC timestamp>/`. That directory
is ignored by Git. Preserve it as raw evidence; the script never overwrites an
existing run.

## Deliberate limits

- The fixture exercises My Mods deterministically at 250 entries. Get Mods uses
  live API data and is not treated as a fixed-fixture comparison in this pass.
- The first pass compares Wry packages. A CEF run is added only after an exact
  matching CEF artifact is available.
- The console probe measures search-to-settled-render latency and animation
  frame intervals. The process sampler is independent of the inspector.
- No telemetry is added. All measurements remain local.
