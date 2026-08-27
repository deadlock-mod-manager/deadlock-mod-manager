# WebView2 startup and recovery verification (#646)

## Result

The intermittent white/black window class is confirmed as an unhandled
WebView2 process-failure state. It is not a normal-startup regression and the
reporter's log does not support the earlier interpretation that WebView2 was
simply uninstalled.

Both stable 1.1.0 and main `db775912` behave the same way under controlled
fault injection:

| Injected failure | Observed behavior | Automatic recovery |
| --- | --- | --- |
| GPU process terminated | UI stays usable; WebView2 starts a WARP GPU process | Yes |
| Main renderer terminated | `RESULT_CODE_KILLED` error page remains after 6 s | No |
| Renderer followed by `Ctrl+R` | Application UI returns | User-initiated |
| Browser process terminated | Stable stays white; main stays black after 6 s | No |
| Browser followed by `Ctrl+R` | Window remains blank | No |
| Manager restarted after browser failure | Application UI returns | User-initiated |

The native `deadlock-mod-manager.exe` process remains `Responding` with a live
window handle after renderer and browser failures. Current application logs do
not record the injected process failure. A browser-process failure leaves no
DMM WebView2 children, but the native process continues to look healthy.

The attached log on evidence issue #539 shows the UI initializing successfully
before backend-to-webview emissions begin failing with `HRESULT(0x8007139F)`.
One error is rendered as `Class not registered`; subsequent calls report that
the resource is in the wrong state. That sequence is consistent with calls
against a failed WebView, but it does not identify which WebView2 process or
driver condition caused the original failure.

## Repeated startup

Twenty launch/stop cycles were run after a clean stable install and again after
an in-place upgrade to main. Readiness is the first observation of a responsive
native window plus its renderer process. Screenshots were sampled two seconds
later and classified by luminance distribution.

| Artifact | Healthy launches | Median readiness | p95 | Maximum |
| --- | ---: | ---: | ---: | ---: |
| Stable 1.1.0 clean install | 20/20 | 814.8 ms | 1,065.6 ms | 2,055.9 ms |
| Main `db775912` upgrade | 20/20 | 809.2 ms | 1,062.7 ms | 1,596.9 ms |

All 40 windows remained responsive and none matched a uniform white or black
frame. The owned VM therefore does not reproduce a spontaneous startup
failure, and main shows no material warm-start regression against stable.

## Runtime and installer checks

The VM used the system-wide WebView2 Evergreen Runtime `151.0.4129.107`. The
Tauri configuration does not set `webviewInstallMode`, so the Windows installer
uses Tauri's default silent `downloadBootstrapper` mode and requires network
access when it needs to install or repair WebView2.

- The runtime's official uninstaller refused forced removal on this Windows 11
  build with exit code 93; the registered runtime and files stayed intact.
- Removing only the EdgeUpdate client registration did not prevent DMM from
  finding the intact runtime files. Re-running the main installer restored the
  registration and took 47.98 seconds.
- Pointing only DMM at a deliberately absent runtime folder produced Tauri's
  explicit native **Could not find the WebView2 Runtime** dialog. The process
  stayed responsive with no WebView2 children and no application log. Clearing
  the override restored a normal launch.

Missing-runtime behavior is therefore visible and actionable, unlike the
intermittent blank state. An offline repair is not provided by the current
installer configuration. Embedding the offline runtime would add roughly the
runtime installer's full size and is not justified by this evidence.

## Environment and artifacts

- Windows 11 Pro build 26200, QEMU, 2 vCPU, 6 GiB RAM
- Microsoft Remote Display Adapter and Red Hat VirtIO GPU DOD controller
- WebView2 `151.0.4129.107`
- Stable installer SHA-256:
  `11e8a0996099e04fcc1a6059f2b5b04ebdc8b572356cb955763b2b8ea5b2d948`
- Main installer SHA-256:
  `dfff75eef3398735478c26be95a6a870acb2259b7d40d346222ece48f1c43463`

The stable installer had a valid SignPath signature. The main nightly used the
project test certificate and was pinned by checksum and commit. No Windows CEF
artifact was published with either tested release, and Wry behavior was already
specific enough that a CEF substitution would not resolve the recovery defect.

The original AMD Radeon RX 9060 XT and its driver were not available. Confidence
is high in the missing recovery and diagnostics, but only medium in the exact
hardware/runtime trigger behind issue #539.

## Run

Run from an elevated interactive Windows PowerShell session so guest-screen
captures are available:

```powershell
& powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\run.ps1 `
  -Artifact C:\path\to\Deadlock.Mod.Manager_x64-setup.exe `
  -Label main
```

The runner silently installs the artifact, records the environment, performs
20 startup cycles, kills only WebView2 children whose command line identifies
`deadlock-mod-manager.exe`, verifies refresh/restart behavior, and exercises a
process-local missing-runtime override. It never uninstalls or edits the system
WebView2 Runtime. Use `-Iterations` to change the startup count and
`-OutputRoot` to select the evidence directory.

## Remediation and regression coverage

On Windows, register WebView2 `ProcessFailed` and `BrowserProcessExited`
handlers through Tauri's `with_webview` access:

- Log failure kind, reason, exit code, process description, runtime version,
  GPU/driver inventory, and the failure-report folder.
- Reload a failed main renderer with a bounded retry/crash-loop guard.
- Recreate the WebView or perform one controlled application restart after the
  browser process exits; a reload cannot recover a closed WebView.
- Keep recovery controls native or process-level because the failed renderer
  cannot render its own recovery UI.

Microsoft's WebView2 guidance defines GPU-process failure as auto-recoverable,
renderer failure as requiring reload or control recreation, and browser-process
failure as requiring WebView recreation. The observed stable/main behavior
matches those engine contracts exactly.

Keep this Windows release-artifact harness as the integration regression. Add a
small deterministic test around the failure-kind-to-action policy so renderer
reload, browser restart, retry limits, and diagnostics do not depend on killing
real processes in routine test runs.
