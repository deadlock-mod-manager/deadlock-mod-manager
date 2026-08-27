# Linux GPU Workaround Gating — 2026-08-27

Issue: #641  
Commit tested: `db775912`  
Release tested: Flatpak `1.0.0`, build date 2026-08-25

## Owned-system result

| Field                  | Value                                            |
| ---------------------- | ------------------------------------------------ |
| GPU                    | AMD Radeon RX 7900 XT                            |
| Driver                 | amdgpu / Mesa 26.1.6                             |
| Active GPU             | AMD                                              |
| Display server         | Wayland                                          |
| Desktop                | KDE Plasma                                       |
| Runtime                | Wry / WebKitGTK                                  |
| Format                 | Flatpak, GNOME 49 runtime                        |
| Setting                | Auto                                             |
| Workaround environment | Not set                                          |
| Functional result      | Window rendered and accepted automated scrolling |

The Flatpak sandbox exposed `/sys/bus/pci/devices/*/vendor`; the application saw
AMD vendor `0x1002` and correctly logged `No NVIDIA GPU detected`. This disproves
the broad claim that current Flatpak builds cannot inspect PCI vendor data. It
does not prove that every NVIDIA Flatpak installation exposes enough information.

An automated multi-page scroll pass was attempted through the KDE remote-desktop
portal. Portal input was too slow and serialized to produce useful comparative
frame-time data. Main-process RSS remained approximately 205–211 MiB during the
bounded pass. No performance claim is made from that noisy measurement.

## Evidence from reported systems

- Issue #281 records an NVIDIA Flatpak blank/grey window fixed by externally
  setting `WEBKIT_DISABLE_DMABUF_RENDERER=1`.
- PR #420 records an NVIDIA X11 white screen fixed by enabling the existing
  two-variable workaround and was locally tested by its author.
- Issue #158 records poor scrolling when the workaround is enabled without need.

These reports justify automatic compatibility handling for NVIDIA on both X11
and Wayland. They do not isolate whether `WEBKIT_DISABLE_COMPOSITING_MODE=1` is
required on either display server.

## Gating disposition

The defensible rule is:

| Runtime | Mode                     | NVIDIA detected | Result                                 |
| ------- | ------------------------ | --------------- | -------------------------------------- |
| CEF     | Any                      | Any             | Off; WebKit variables are inapplicable |
| Wry     | Force Off or CLI disable | Any             | Off                                    |
| Wry     | Force On                 | Any             | On                                     |
| Wry     | Auto                     | Yes             | On on X11 and Wayland                  |
| Wry     | Auto                     | No              | Off                                    |

`Auto` continues to treat any visible NVIDIA PCI device as sufficient. On a
hybrid system this is hardware-presence detection, not active-renderer detection.
Changing that rule or removing the compositing variable is explicitly deferred
until physical NVIDIA hybrid hardware can compare blank-window behavior and
scroll/frame-time performance. False-positive compatibility activation is safer
than reintroducing an unusable window, while Force Off remains available.

## Regression strategy

- Unit-test runtime, CLI, forced-mode, and auto-mode decisions.
- Keep the compatibility setting hidden and inactive for CEF artifacts.
- On the next available NVIDIA host, capture X11 and Wayland results for Wry with
  neither variable, DMA-BUF only, and both variables. Record active renderer,
  driver, blank-window result, scroll frame time, and CPU before narrowing the
  workaround.
