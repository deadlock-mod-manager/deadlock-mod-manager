# Tauri MCP tools

Read the connected server's tool schemas before calling tools. The bridge listens on `127.0.0.1:9223` in supported debug builds; the user starts the app. If connection fails, use `get_setup_instructions` before changing project files to fix connectivity.

## Tool selection

| Goal | Tool |
| --- | --- |
| Connect, check session, disconnect | `driver_session` with `action: "start"`, `"status"`, or `"stop"` |
| Confirm UI appearance | `webview_screenshot` |
| Find controls, roles, and refs | `webview_dom_snapshot` with `type: "accessibility"` |
| Inspect DOM structure and selectors | `webview_dom_snapshot` with `type: "structure"` |
| Click, type, scroll, or navigate | `webview_interact` using snapshot refs or CSS/text selectors |
| Inspect webview console errors | `read_logs` with `source: "console"` |
| Read app metadata, Tauri version, and windows | `ipc_get_backend_state` |
| Execute JavaScript or invoke a Rust command | `webview_execute_js` |
| Watch frontend/Rust IPC | `ipc_monitor` followed by `ipc_get_captured` |
| Wait for an element or IPC event | `webview_wait_for` |

`ipc_execute_command` can return "Unsupported Tauri command" for an app command. Use `webview_execute_js` with an IIFE instead:

```javascript
(() => {
  const { invoke } = window.__TAURI__.core;
  return invoke("is_game_running");
})();
```

After changing a desktop UI or command, navigate to the affected view, perform the user action, capture screenshots and DOM evidence, inspect the IPC or persisted side effect, and check logs if anything fails. Follow the main skill's evidence and cleanup requirements.
