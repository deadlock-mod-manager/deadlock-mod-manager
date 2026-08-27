# Tier 1 desktop matrix measurements

This file records environment-cell results for
[Measure stable and main across the Tier 1 desktop matrix](https://github.com/deadlock-mod-manager/deadlock-mod-manager/issues/633).
The harness and its original exploratory findings remain documented in
[`README.md`](./README.md) and [`FINDINGS.md`](./FINDINGS.md).

## Materiality floors

The following floors were fixed before the decision-grade run:

- search latency: 25 ms;
- frame interval: 4 ms;
- CPU: 5 percentage points of one core;
- RSS: 64 MiB;
- filesystem writes: 1 MiB.

A regression or improvement must also cross 15% and agree in both balanced
blocks. The search-response absolute budget is p95 <= 200 ms; scrolling is p95
<= 33 ms with fewer than 1% of frames over 50 ms.

## CachyOS / RX 7900 XT / Wry

### Cell and workload

- CachyOS, Linux 7.1.6-1-cachyos, KDE Wayland.
- AMD Ryzen 7 5800X3D, Radeon RX 7900 XT, `amdgpu`, Mesa 26.1.6.
- Wry/WebKitGTK 2.52.6; extracted amd64 Debian artifacts.
- Stable 1.1.0 versus nightly `db775912`, using the hashes recorded in
  [`FINDINGS.md`](./FINDINGS.md).
- Process-cold launch with fresh XDG roots, a 15-second startup-settling
  window, and a 250-mod paginated stress fixture.
- Three unmeasured warmups followed by two blocks of 20 samples. Block 1 ran
  stable then nightly; block 2 reversed the order.
- The controlled search selects `Fixture Mod 0249` so Fuse must inspect the
  complete library before producing one result. Clearing the query restores
  the full paginated view. Repetition measures variance; it is not intended to
  represent different search terms.

### Decision-grade blocks

| Metric                | Block 1 stable | Block 1 nightly | Block 2 stable | Block 2 nightly |
| --------------------- | -------------: | --------------: | -------------: | --------------: |
| Search to one, median |         449 ms |          448 ms |         449 ms |          448 ms |
| Search to one, p95    |         455 ms |          453 ms |         456 ms |          449 ms |
| Clear search, median  |         338 ms |          334 ms |         337 ms |          333 ms |
| Clear search, p95     |         354 ms |          353 ms |         353 ms |          344 ms |
| Frame interval, p95   |          17 ms |           18 ms |          17 ms |           18 ms |
| Frames over 50 ms     |             0% |              0% |             0% |              0% |
| Idle RSS, median      |     1009.2 MiB |      1029.9 MiB |      921.6 MiB |      1042.0 MiB |
| Idle writes           |         32 KiB |          64 KiB |         64 KiB |          96 KiB |

Stable and nightly are equivalent within the relative and materiality gates for
search, frames, RSS, and filesystem writes. Both builds fail the 200 ms search
budget. The shared `useSearch` path has an unchanged 300 ms debounce, so this
is an inherited absolute-budget failure rather than a stable-to-nightly
regression. Scrolling remains within budget.

### Fixture-breadth check

Five-sample exploratory pairs checked whether the stress result was peculiar to
the 250-mod fixture. Both pairs used the same focused, paginated, animated
search/scroll journey and passed the focus and visibility checks:

| Fixture        | Stable search median/p95 | Nightly search median/p95 | Stable frame p95 | Nightly frame p95 |
| -------------- | -----------------------: | ------------------------: | ---------------: | ----------------: |
| Small, 25 mods |               439/449 ms |                437/440 ms |            18 ms |             18 ms |
| Rep., 75 mods  |               448/450 ms |                449/449 ms |            18 ms |             18 ms |

Neither exploratory pair crosses the relative or absolute materiality gates,
so the protocol does not trigger a 20-sample confirmation. Together with the
stress result, they show that the unchanged 300 ms debounce dominates observed
search latency at these fixture sizes. The raw captures are
`20260827T001119Z` and `20260827T001308Z` under the ignored local result tree.

### Focus control correction

The two main blocks did not preserve native window focus in their result
manifest. Their CPU values are invalid because the occult background pauses
when `document.hasFocus()` is false. A short validation pair added compositor
focus control and recorded `hasFocus=true` and `visibilityState=visible` at
both preparation and probe completion:

| Focused idle metric  |     Stable |    Nightly |
| -------------------- | ---------: | ---------: |
| CPU median, one core |     30.16% |     30.10% |
| RSS median           | 1000.4 MiB | 1022.3 MiB |
| Filesystem writes    |     48 KiB |     48 KiB |

This disproves the apparent 0% versus 30% CPU split as a focus-state artifact.
The focused pair is diagnostic rather than a replacement decision-grade CPU
comparison; no build-attributable CPU improvement or regression is claimed.

### Cell disposition

- **Inherited performance debt:** search response cannot meet the current
  200 ms budget because the unchanged debounce alone is 300 ms.
- **Equivalent within protocol limits:** stable versus nightly search latency,
  scrolling, RSS, and steady-state writes.
- **Invalid and corrected diagnostically:** uncontrolled-focus CPU values from
  the main blocks.

## Windows 11 QEMU NSIS smoke

### Environment and artifacts

- Windows 11 Pro 64-bit, build 26200, under QEMU/KVM with two logical Ryzen 7
  5800X3D processors and 6 GiB RAM.
- Red Hat VirtIO GPU plus the Microsoft Remote Display Adapter over RDP.
- Microsoft Edge WebView2 `151.0.4129.107`.
- Stable `1.1.0` NSIS artifact, SHA-256
  `11e8a0996099e04fcc1a6059f2b5b04ebdc8b572356cb955763b2b8ea5b2d948`.
- Nightly `1.2.0-nightly.20260825.db775912` NSIS artifact, SHA-256
  `dfff75eef3398735478c26be95a6a870acb2259b7d40d346222ece48f1c43463`.

The stable Authenticode signature validated to SignPath Foundation. The
nightly checksum matched its GitHub release asset, but Windows reported
`UnknownError` for its embedded untrusted test certificate. The nightly is
therefore identity-matched but not trust-equivalent to the stable artifact.

### Package prerequisite

The VM initially lacked the Microsoft Visual C++ runtime. Installing stable
completed successfully, but launching it failed with missing `MSVCP140.dll`.
After installing the current Microsoft x64 Visual C++ redistributable, whose
Authenticode status was `Valid`, both artifacts installed and launched. This
is a reproducible package-prerequisite blocker on an otherwise working Windows
11/WebView2 environment; the DMM NSIS installer did not supply the dependency.

### Exploratory install and launch smoke

Each artifact received a fresh application-data root. Five process-cold
launches measured process start to the first responsive native window. These
samples do not establish first-interactive-shell latency or a decision-grade
performance verdict:

| Metric                        |     Stable |   Nightly |
| ----------------------------- | ---------: | --------: |
| Silent install, single sample |     5.64 s |    6.65 s |
| Responsive launches           |        5/5 |       5/5 |
| First launch after install    |     743 ms |    818 ms |
| Remaining four launch median  |     114 ms |    106 ms |
| Remaining four launch range   | 102-117 ms | 85-115 ms |

No relative launch failure appeared. Installer timing is unbalanced and has no
predeclared materiality floor, so the observed difference is not a regression
claim. Raw environment, per-launch, installer, signature, and hash data remain
in the ignored local `result/issue-633/windows-vm/` packet.

### Functional correctness finding

The nightly rendered its onboarding/dashboard shell, but the What's New dialog
displayed `whatsNew.versions.1.2.0-nightly.20260825.db775912.title` as visible
text. The running version is used directly as an i18n lookup key while the
English locale has no matching nightly entry. This is a visually reproduced
nightly correctness failure and remains separate from the performance verdict.

This completes the physical CachyOS/RX 7900 XT Wry decision-grade stress
search/scroll cell, exploratory small and representative fixture checks, and
the permitted Windows 11 QEMU NSIS/install/launch smoke. It does not cover the
clean fixture; lifecycle, import, download, or updater journeys; CEF; or either
required Windows 11 physical GPU/rendering cell. Those limits prevent closing
the matrix ticket or claiming full Tier 1 coverage.
