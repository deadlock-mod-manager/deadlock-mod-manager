# Build CEF against a pinned Tauri runtime and compatible plugins

The upstream CEF branch exposes a standalone runtime and omits features used by released Wry builds, while Cargo still resolves optional dependencies. Pin compatible Tauri and plugin revisions, centralize CEF feature and packaging overrides, use the non-GTK dialog backend and restore Wry settings after the CEF build.
