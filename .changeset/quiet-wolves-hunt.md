---
"@deadlock-mods/desktop": patch
---

Fix CEF build missing libcef.dll by centralizing the `--features cef` contract in the `cef-patch.ts` wrapper so every CEF build invocation passes the flag to both the Tauri CLI bundler and cargo.
