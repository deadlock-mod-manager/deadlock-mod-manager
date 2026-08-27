# Game process recovery measurement (#644)

## Result

Issue #542 was not reproduced in the owned Windows environment. Both the
current stable release and the tested `main` artifact returned from **Stop
Game** to the launch controls after normal exit, a deliberate crash, and a
forced process termination. A manager restart also reconstructed the live
process state and cleared it after the fixture exited.

The UI query polls every five seconds. Each recorded `*-settled` checkpoint
waits six seconds, so the result is a bounded recovery assertion rather than
an exact latency benchmark.

| Scenario | Stable 1.1.0 | Main `db775912` |
| --- | --- | --- |
| Fixture running | Stop Game | Stop Game |
| Normal exit + 6 s | Launch controls | Launch controls |
| `Environment.FailFast` + 6 s | Launch controls | Launch controls |
| `Stop-Process -Force` + 6 s | Launch controls | Launch controls |
| Manager restart while fixture is live | Stop Game | Stop Game |
| Fixture exit after manager restart + 6 s | Launch controls | Launch controls |
| Steam unavailable launch | Error; remains launchable | Error; remains launchable |

## Environment

- Windows 11 Pro, build 26200, QEMU VM, 2 vCPU, 6 GiB RAM
- WebView2 `151.0.4129.107`
- Stable installer SHA-256:
  `11e8a0996099e04fcc1a6059f2b5b04ebdc8b572356cb955763b2b8ea5b2d948`
- Main nightly installer SHA-256:
  `dfff75eef3398735478c26be95a6a870acb2259b7d40d346222ece48f1c43463`

The stable installer had a valid SignPath signature. The nightly used the
project test certificate and was pinned by checksum and commit.

## Run

From an elevated Windows PowerShell session, with a host folder redirected as
`\\tsclient\DMM`:

```powershell
& powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File "\\tsclient\DMM\run.ps1" `
  -Artifact "C:\path\to\Deadlock.Mod.Manager_x64-setup.exe" `
  -Label stable
```

The runner silently installs the selected artifact, compiles a deterministic
`deadlock.exe` fixture, writes a minimal valid game tree and app state, and
emits timestamped NDJSON checkpoints. It does not require Steam or Deadlock.

On the Linux host, record the real release UI by passing the RDP window bounds:

```bash
./capture.sh stable result/issue-644/windows-vm \
  1760 1631 1600 1028 result/issue-644/windows-vm/stable-captures
```

`capture.sh` requires `jq`, KDE Spectacle, and ImageMagick. Start it before the
PowerShell runner. Screenshots and event files are evidence artifacts and stay
under the ignored `result/` directory.

## Steam launch failure

With the valid fake game path loaded and Steam intentionally absent, clicking
**Launch modded** exercised `start_game`. Stable logged the attempted
`steam://run/1422450//-condebug` launch; main logged the corresponding URI open.
Both returned an error immediately and retained the launch controls. Neither
produced a false running state.

## Disposition and remaining uncertainty

Confidence is high that the cached process list is refreshed correctly for
these Windows exit modes on stable 1.1.0 and current main. No production change
is justified from this reproduction.

The original report may depend on a real Deadlock/Steam child process that
remains alive, WebView polling being suspended while hidden, or an older build.
Those hypotheses need logs and a process snapshot from an affected machine.
Linux/Proton was not added because the evidence issue is Windows-specific and
the owned Windows run was conclusive.

A deterministic regression test should put process enumeration behind an
injectable boundary, then assert live-to-dead transitions without relying on
the full desktop UI. Keep one Windows smoke run for the `sysinfo` integration
and the five-second toolbar poll.
