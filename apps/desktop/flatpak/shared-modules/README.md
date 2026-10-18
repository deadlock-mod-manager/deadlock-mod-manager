# Flathub shared modules

Vendored unchanged from [flathub/shared-modules](https://github.com/flathub/shared-modules) at `a58e654b9113feffaee113cc7167ebbbdb406bee`. The directory layout matches upstream so relative module paths resolve.

- `libayatana-appindicator/` — the tray icon library. The `tray-icon` Tauri feature loads it at runtime, and the GNOME runtime does not ship it. The CEF manifest does not need it because the Electron BaseApp already provides `libappindicator-gtk3`.
- `intltool/` — build dependency of `libdbusmenu`.

To update, copy the files from a newer upstream commit and update the commit above.
