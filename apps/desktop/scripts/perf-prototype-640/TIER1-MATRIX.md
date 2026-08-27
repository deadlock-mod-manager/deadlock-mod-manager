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

This completes only the physical CachyOS/RX 7900 XT Wry stress-search/scroll
cell. It does not cover clean, small, or representative fixtures; lifecycle,
import, download, or updater journeys; CEF; or either required Windows 11
physical cell. Those limits prevent closing the matrix ticket or claiming full
Tier 1 coverage.
