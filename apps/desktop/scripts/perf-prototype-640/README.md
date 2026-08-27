# Issue #640 Linux desktop measurement prototype

This is a throwaway measurement harness for GitHub issue
[#640](https://github.com/deadlock-mod-manager/deadlock-mod-manager/issues/640).
It does not install either application package and it does not read or write the
normal Deadlock Mod Manager data directory.

The harness downloads and verifies the exact v1.1.0 and rolling-nightly Debian
packages, extracts them under the ignored `result/` directory, and launches each
with isolated XDG data/config/cache directories. Each run receives the same
synthetic library and records the entire app/WebKit process group's CPU, RSS,
process count, and `/proc` I/O counters every 250 ms.

Decision-grade reuse of this harness for the Tier 1 matrix is recorded in
[`TIER1-MATRIX.md`](./TIER1-MATRIX.md).

## First CachyOS pass

Close any running Deadlock Mod Manager instance, then run from the repository
root:

```bash
bash apps/desktop/scripts/perf-prototype-640/hitl-linux.sh
```

The script starts with five measured samples so an exploratory pass stays
short. It drives the app through WebKit's loopback inspector, opens My Mods,
verifies the fixture, runs the probe, and captures the result without manual
interaction. A 15-second stabilization window keeps initial shader/WebKit cache
writes out of the measured idle window. Set `DMM_PERF_AUTOMATE=0` only when
debugging the probe by hand.

CPU comparisons involving focus-aware animation must set
`DMM_PERF_FOCUS=focused`. Focus the native Tauri window when each artifact
launches; the harness waits for and records the resulting document focus and
visibility state:

```bash
DMM_PERF_FOCUS=focused bash apps/desktop/scripts/perf-prototype-640/hitl-linux.sh
```

To run only the stable/nightly pair for one case, set `DMM_PERF_CASE` to
`paginated-animated`, `paginated-static`, `paginated-occult-off`, or
`unpaginated-animated`:

```bash
DMM_PERF_CASE=paginated-animated bash apps/desktop/scripts/perf-prototype-640/hitl-linux.sh
```

The default fixture is the 250-mod stress corpus. Set
`DMM_PERF_FIXTURE_COUNT` to run the same controlled search/scroll journey with
another corpus size, such as the 25-mod small or 75-mod representative fixture:

```bash
DMM_PERF_FIXTURE_COUNT=75 DMM_PERF_CASE=paginated-animated \
  bash apps/desktop/scripts/perf-prototype-640/hitl-linux.sh
```

For an agent-driven comparison where the inspected app may be backgrounded,
use the timer-driven probe clock. Search-settle and process measurements remain
valid, but frame timing is explicitly recorded as unavailable:

```bash
DMM_PERF_CASE=paginated-animated DMM_PERF_PROBE_CLOCK=timer \
  bash apps/desktop/scripts/perf-prototype-640/hitl-linux.sh
```

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

- The fixture exercises My Mods deterministically and defaults to the 250-entry
  stress corpus. The Tier 1 matrix also uses 25-entry small and 75-entry
  representative variants. Get Mods uses live API data and is not treated as a
  fixed-fixture comparison in this pass.
- The first pass compares Wry packages. A CEF run is added only after an exact
  matching CEF artifact is available.
- The console probe measures search-to-settled-render latency and animation
  frame intervals. The process sampler is independent of the inspector.
- No telemetry is added. All measurements remain local.
