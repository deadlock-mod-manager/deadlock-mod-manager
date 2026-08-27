# Reset-to-enable transition probe

This harness reproduces the game configuration state transition from
[issue #643](https://github.com/deadlock-mod-manager/deadlock-mod-manager/issues/643)
against checksummed stable and main desktop artifacts without touching the real
Deadlock installation or launching Steam.

Run it from the repository root with no other Deadlock Mod Manager instance
open:

```bash
bash apps/desktop/scripts/perf-prototype-643/repro-reset-enable.sh ARTIFACT
```

`ARTIFACT` is `stable` or `main`. The harness:

1. downloads and verifies the selected Debian artifact;
2. downloads the fixed vanilla `gameinfo.gi` fixture and verifies its SHA-256;
3. creates an isolated fake Deadlock tree and persisted store;
4. enables the fake tree, resets it through the production API command, and
   retries enable in the same process;
5. records every observed file hash, CRLF/bare-LF count, marker state, command
   result, app log, and a 20-second post-failure crash window.

The expected current result is red: retry-enable fails and the script exits
nonzero. Raw evidence is stored under `result/issue-643/` and ignored by Git.
Set `DMM_643_POST_FAILURE_WAIT_SECONDS=0` only for quick error-shape checks.

This release-artifact harness uses WebKit inspection because the required
stable/main binaries do not contain the debug-only Tauri MCP bridge.

See [FINDINGS.md](./FINDINGS.md) for the confirmed causes, deferred allocator
symptom, and remediation coverage.
