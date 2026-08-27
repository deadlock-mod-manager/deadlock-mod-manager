# Large raw VPK import findings

Issue: [Reproduce and profile large raw VPK import and archive handling](https://github.com/deadlock-mod-manager/deadlock-mod-manager/issues/642)

## Decision

Confirmed. Path-backed dropped files are read into a Rust `Vec<u8>` and returned
as the generic Tauri command result. Tauri serializes that result as a JSON
number array; WebKit materializes it on the renderer thread. This boundary is
the dominant cause of the reported freeze and memory growth.

The exact 200 MiB raw fixture took 14.826 seconds, added 3,916.6 MiB RSS, and
stopped the focused webview's responsiveness timer for 10.555 seconds. This
fails both issue budgets: raw import p95 at or below 10 seconds and no UI stall
over 250 ms.

The fix should keep path-backed VPK and RAR/7z files in the backend: validate
the source path, copy or move it directly into the mod staging directory, then
parse or extract there. File bytes should not cross IPC. Returning
`tauri::ipc::Response` would remove JSON encoding but still needlessly transfers
the full file through the renderer and back to plugin-fs.

## Environment and artifacts

- Physical Linux host: CachyOS, KDE Plasma Wayland
- CPU: AMD Ryzen 7 5800X3D
- GPU: AMD Radeon RX 7900 XT
- Memory: 62 GiB
- WebKitGTK: 2.52.6
- Stable: 1.1.0 Debian package SHA-256
  `18a1eb0e68d794365ff67be2e9a733b93de0902246d956b17b73cc6430205009`;
  binary SHA-256
  `71c6e44010a9ed3b5e7d29a328933f4ef2476d224b0ef852241e3492ab04e78c`
- Main-at-measurement: commit `db775912eb2ced35ab94c38082c1fa374f243e18`,
  version `1.2.0-nightly.20260825.db775912`, Debian package SHA-256
  `14e887792248128a6be0e5336628dc8c4c70ac257704c74b65c950ca530fdbf0`;
  binary SHA-256
  `75bd68b1460075f4bbe2ba9f5aef13f5d4a8a99c6a1e6e56a13f4f5c6fd8381`
- Measurement date: 2026-08-26 EDT / 2026-08-27 UTC
- Focus and visibility were asserted for every responsiveness sample.

Main and the nightly artifact are the same commit. No relevant source differs
between that commit and `origin/main` at measurement time.

## Results

### Payload-size sweep on stable

| Payload | IPC elapsed | Max UI gap |   RSS delta | Result          |
| ------: | ----------: | ---------: | ----------: | :-------------- |
|   1 MiB |       45 ms |      25 ms |    35.9 MiB | pass            |
|   5 MiB |      192 ms |     105 ms |   223.9 MiB | pass            |
|  10 MiB |      358 ms |     192 ms |   334.7 MiB | pass            |
|  13 MiB |      463 ms |     247 ms |   474.0 MiB | pass, marginal  |
|  14 MiB |      504 ms |     256 ms |   488.1 MiB | fail            |
|  15 MiB |      542 ms |     286 ms |   481.8 MiB | fail            |
|  34 MiB |    1,313 ms |     734 ms |   844.7 MiB | fail, completes |
| 200 MiB |   14,826 ms |  10,555 ms | 3,916.6 MiB | fail            |

The 34 MiB case models the reporter's compressed archive transport size. It
explains why the archive can complete while the 200 MiB raw VPK appears to hang,
but it also shows that the archive transport path is not responsive.

### Stable versus main at 14 MiB

| Artifact        | IPC elapsed | Max UI gap | RSS delta |
| :-------------- | ----------: | ---------: | --------: |
| Stable 1.1.0    |      504 ms |     256 ms | 488.1 MiB |
| Main `db775912` |      524 ms |     293 ms | 491.3 MiB |

The failure is unchanged on main.

### Stage isolation

| Stage                           |           Payload |  Elapsed | Max UI gap | RSS delta |
| :------------------------------ | ----------------: | -------: | ---------: | --------: |
| Full read → convert → raw write |            14 MiB |   538 ms |     267 ms | 521.8 MiB |
| `parse_vpk_file` only           |           200 MiB |   689 ms |      12 ms | 200.9 MiB |
| Backend 7z extraction only      | 239 KiB → 200 MiB |   689 ms |      13 ms |  33.3 MiB |
| Native cached read              |           200 MiB | 18–21 ms |        n/a |       n/a |

The 14 MiB full roundtrip breaks down into 503 ms receiving the command result,
8 ms constructing the frontend `Uint8Array`, and 27 ms writing through the raw
plugin-fs request. At the IPC peak, the Rust app had added 46.0 MiB RSS and the
WebKit process had added 458.9 MiB; the renderer accounts for 94% of the sampled
growth.

`parse_vpk_file` is not called by the manual raw-drop path. Its independent
measurement also disproves parsing as the reported freeze. Backend extraction
is responsive and low-memory once the archive is already staged.

## Call path and cleanup

The failing manual import path is:

```text
path-backed File
  → read_dropped_mod_file
  → tokio::fs::read into Vec<u8>
  → serde JSON number array over Tauri IPC
  → JavaScript number array
  → Uint8Array
  → plugin-fs raw write into app-local data
```

For RAR/7z, the same transfer stages the compressed archive before backend
extraction. The archive remains beside the extracted VPK after a successful
local import; the source VPK in `files/` is needed for later enable/disable
operations, but the compressed staging archive is redundant after successful
extraction. The extraction probe confirmed both remained on disk.

## Remediation and regression coverage

1. Add a narrowly scoped backend staging command for validated dropped mod
   paths. Copy VPKs directly to `files/`; copy RAR/7z files into the mod staging
   directory and extract there.
2. Preserve a path-backed source variant through drop resolution for both VPK
   and archive inputs. The current `vpkPath` variant only serves Forge installs.
3. Remove the staged RAR/7z archive after successful extraction; preserve it on
   failure for diagnosis or fallback behavior.
4. Keep browser-only `File` inputs on the existing byte path, with an explicit
   size guard because those bytes cannot be copied from a native path.
5. Add backend integration tests for byte-identical staging and cleanup, drop
   resolver tests for path preservation, and keep this 14 MiB red-capable probe
   as the responsiveness regression check.
