# Tauri conventions

Use Tauri v2 consistently across Rust dependencies, JavaScript dependencies, configuration, and API calls.

## Dependencies

- Rust `tauri`, `tauri-build`, and `tauri-plugin-*` dependencies must use v2-compatible requirements; `"2"` is the preferred major-version requirement.
- JavaScript `@tauri-apps/*` packages must stay on v2-compatible versions, such as `^2.x.x` or `~2.x.x`. Avoid wildcard or unbounded requirements that could resolve to another major version.
- When adding a plugin, consult the [official v2 plugin list](https://v2.tauri.app/plugin/). Update both Rust and JavaScript sides when the plugin has both.
- Read release notes and test affected behavior after updates. Replace v1 dependencies and API calls with their v2 equivalents.
- Investigate version conflicts through dependency requirements and `Cargo.lock`; keep both sides on compatible v2 versions.

## Configuration and capabilities

- Tauri configuration uses the [v2 schema](https://schema.tauri.app/config/2.0.0).
- Define permissions in capability files under `apps/desktop/src-tauri/capabilities/`, rather than in the main Tauri config.
- The debug Wry MCP bridge permission lives in `apps/desktop/src-tauri/capabilities/wry/mcp-bridge.json`. The bridge is registered in `apps/desktop/src-tauri/src/lib.rs` only for supported debug builds.

For desktop UI, IPC, or command verification, use [verify-desktop](../skills/verify-desktop/SKILL.md). The user starts the dev app.

## Before finishing

- Check Rust and JavaScript dependencies for incompatible major versions.
- Verify the capability files cover the plugin permissions.
- Test the changed plugin or command behavior in the running debug app.
