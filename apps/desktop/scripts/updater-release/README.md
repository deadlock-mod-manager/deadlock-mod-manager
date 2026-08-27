# Updater release verification

`verify.sh` checks live Tauri updater manifests before a release is treated as
publishable. It verifies that each manifest exists, has the required shape,
contains non-empty native updater signatures, and references artifacts that
resolve successfully.

Flatpak entries fail deliberately. Flatpak installations are owned by their
configured package source and must not be updated through Tauri's native
updater manifest.

## Requirements

- Bash
- curl
- jq

## Usage

Check the stable and nightly Wry channels:

```sh
apps/desktop/scripts/updater-release/verify.sh \
  https://github.com/deadlock-mod-manager/deadlock-mod-manager/releases/latest/download/latest.json \
  https://github.com/deadlock-mod-manager/deadlock-mod-manager/releases/download/nightly/latest.json
```

Check the CEF channels separately so a Wry manifest can never mask missing CEF
metadata:

```sh
apps/desktop/scripts/updater-release/verify.sh \
  https://github.com/deadlock-mod-manager/deadlock-mod-manager/releases/latest/download/latest-cef.json \
  https://github.com/deadlock-mod-manager/deadlock-mod-manager/releases/download/nightly/latest-cef.json
```

The command exits nonzero if any manifest, signature, package boundary, or
artifact URL fails validation. Windows Authenticode trust still needs to be
verified on Windows after signing; this script only validates the Tauri
metadata layer.
