# WebView2 recovery release verification (#651)

This harness verifies the native Wry/WebView2 recovery path against an installed
Windows release artifact. It terminates only WebView2 processes whose command
line identifies `deadlock-mod-manager.exe`, then checks that:

- a failed GPU process is replaced while the manager process remains alive;
- a failed main renderer is replaced by the native reload handler; and
- a failed browser process causes one controlled manager restart.

Run it from an elevated, interactive Windows PowerShell session:

```powershell
& powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\apps\desktop\scripts\webview2-recovery\run.ps1 `
  -Artifact C:\path\to\Deadlock.Mod.Manager_x64-setup.exe `
  -OutputPath C:\path\to\webview2-recovery.json
```

The artifact is installed silently. Any currently running Deadlock Mod Manager
instance is stopped before and after the run. The script does not uninstall or
modify the system WebView2 runtime. A non-zero exit means a recovery assertion
failed; the JSON output retains the process IDs and timings observed before the
failure.

