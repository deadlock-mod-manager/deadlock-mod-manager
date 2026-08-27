# Large VPK import probe

This harness reproduces and separates the expensive stages of path-backed VPK
and archive imports for [issue #642](https://github.com/deadlock-mod-manager/deadlock-mod-manager/issues/642).
It drives signed desktop artifacts through WebKit's inspector while the byte
payload remains entirely inside the app.

Run it from the repository root on Linux with no other Deadlock Mod Manager
instance open:

```bash
bash apps/desktop/scripts/perf-prototype-642/repro-ipc.sh ARTIFACT SIZE_MIB MODE
```

- `ARTIFACT`: `stable` or `main`
- `SIZE_MIB`: positive integer; `14` is the smallest observed payload over the
  250 ms responsiveness limit on the measured host
- `MODE`: `read`, `roundtrip`, `parse`, or `extract`

Examples:

```bash
bash apps/desktop/scripts/perf-prototype-642/repro-ipc.sh stable 14 read
bash apps/desktop/scripts/perf-prototype-642/repro-ipc.sh main 14 roundtrip
bash apps/desktop/scripts/perf-prototype-642/repro-ipc.sh stable 200 parse
bash apps/desktop/scripts/perf-prototype-642/repro-ipc.sh stable 200 extract
```

`read` invokes `read_dropped_mod_file`. `roundtrip` additionally performs the
frontend `Uint8Array` conversion and raw plugin-fs write. `parse` invokes
`parse_vpk_file` independently. `extract` creates a highly compressible 7z
fixture and measures backend extraction independently from archive transport.

The harness downloads and verifies the exact stable and main-at-measurement
Debian artifacts, creates a deterministic sparse VPK fixture, launches with an
isolated persisted store, samples per-process RSS every 50 ms, and measures a
10 ms responsiveness timer in the focused webview. It exits nonzero when the
maximum timer gap exceeds 250 ms or the probe fails. Raw evidence is written to
`result/issue-642/` and is intentionally ignored by Git.

The 200 MiB fixture has a valid checked-in VPK directory tree followed by a
sparse zero-filled data section. It models allocation, serialization, IPC, and
decompression costs, not physical cold-disk throughput.

See [FINDINGS.md](./FINDINGS.md) for the recorded artifact identities, results,
and remediation target.
