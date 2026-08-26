# Linux desktop performance findings

This records the focused Wave 1 result for
[Measure Linux desktop rendering and persisted-store update costs](https://github.com/deadlock-mod-manager/deadlock-mod-manager/issues/640).
Raw run directories remain local and ignored by Git.

## Environment and protocol

- Host: CachyOS, Linux 7.1.6-1-cachyos, KDE Wayland.
- CPU/GPU: AMD Ryzen 7 5800X3D and Radeon RX 7900 XT using `amdgpu`,
  Mesa 26.1.6.
- Runtime: Wry/WebKitGTK (`webkit2gtk-4.1` 2.52.6).
- Artifacts: extracted, uninstalled amd64 Debian packages.
  - Stable: `1.1.0`, SHA-256
    `18a1eb0e68d794365ff67be2e9a733b93de0902246d956b17b73cc6430205009`.
  - Nightly: `1.2.0-nightly.20260825.db775912`, SHA-256
    `14e887792248128a6be0e5336628dc8c4c70ac257704c74b65c950ca530fdbf0`.
- Fixture: 250 installed mods, pagination on, animated occult background.
- Isolation: fresh XDG data, config, and cache roots for every artifact.
- Sampling: cold launch, 15-second post-render stabilization, 15-second idle
  window, three probe warmups, then five measured samples. The process sampler
  covered the entire app/WebKit process group at 250 ms intervals.

The decision gate was a repeatable regression of at least 15% plus a material
absolute difference. The focused run produced no such signal, so the protocol
did not call for two 20-sample decision blocks.

## Focused Wry result

| Webview metric                         |       Stable |      Nightly | Nightly delta |
| -------------------------------------- | -----------: | -----------: | ------------: |
| Search to one mod, median / p95        | 450 / 453 ms | 451 / 457 ms | +0.2% / +0.9% |
| Clear search to all mods, median / p95 | 341 / 347 ms | 353 / 354 ms | +3.5% / +2.0% |
| Animation-frame interval, median / p95 |   17 / 18 ms |   16 / 17 ms | -5.9% / -5.6% |
| Frames over 50 ms                      |      0 / 296 |      0 / 307 |     no change |

| Process-group metric    |              Stable |             Nightly | Nightly delta |
| ----------------------- | ------------------: | ------------------: | ------------: |
| Idle RSS, median / p95  | 1017.6 / 1017.8 MiB | 1039.6 / 1040.2 MiB | +2.2% / +2.2% |
| Idle filesystem writes  |              96 KiB |             100 KiB |        +4 KiB |
| Probe RSS, median / p95 | 1047.3 / 1061.2 MiB |  955.5 / 1053.2 MiB | -8.8% / -0.8% |

Idle and probe CPU were sensitive to window/compositor state. The frame run
measured stable at 30.2% of one core and nightly at 3.8%, while a repeated
timer-clock process run measured both at approximately 30.1%. This rules out a
nightly CPU regression in the measured case but is not evidence of a nightly
CPU improvement. Frame timing, search latency, RSS, and write deltas were
consistent enough to evaluate the regression gate.

An earlier automated run began its idle window immediately after first render
and recorded about 139 MiB of writes for both artifacts. Inspection showed that
late startup shader/WebKit cache compilation caused the writes. Adding the
stabilization window reduced steady-state writes to 96-100 KiB and prevents
startup work from being mislabeled as persisted-store churn.

## Persisted-store result

A deterministic production-seam check found that 20 `setModProgress` updates
produce 20 plugin-store saves. `modProgress` is removed by `partialize`, but the
persist middleware still invokes storage for every progress-only state update.
The relevant path is unchanged between stable and nightly, so this is confirmed
inherited performance debt rather than a new regression.

Recommended remediation is to move download progress into a non-persisted
store, or make persistence skip writes when the partialized value is unchanged.
Regression coverage should use a counting storage adapter and assert that
progress-only updates cause zero saves while a persistent setting change still
causes one save.

## Disposition and limits

Recommended disposition: **confirmed** for inherited persisted-store write
amplification and **disproved** for a stable-to-nightly Wry regression in the
focused 250-mod rendering case.

The CEF comparison is explicitly deferred because an exact matching CEF
artifact was unavailable. Static/disabled occult and unpaginated cases remain
available in the harness if a later report makes those variants decision
relevant; the focused result did not justify expanding this exploratory pass.
