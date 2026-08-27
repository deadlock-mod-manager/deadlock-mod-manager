# Flatpak portal and path verification (#645)

## Result

The current KDE portal does not reproduce the reported folder-picker crash.
Stable 1.1.0 WebKit and main `db775912` both accept the native Steam/Deadlock
paths. Main also accepts portal-granted game and custom Steam directories that
are otherwise outside the Flatpak filesystem allowlist, and stable CEF restores
those grants when launched with the socket workaround below.

The public Linux download exposes a more immediate failure. The website links
to `deadlock-mod-manager-cef.flatpak`, whose stable 1.1.0 manifest still grants
`fallback-x11`. On the tested KDE Wayland system that bundle panics with
`Runtime(CreateWindow)` on every launch. Running the same installed bundle with
`--socket=x11 --nosocket=fallback-x11` starts normally. Main contains the
already-merged fix from #605 and starts without an override.

| Artifact | Default game picker | External portal paths | Startup |
| --- | --- | --- | --- |
| Stable 1.1.0 WebKit | Pass | Not repeated | Pass |
| Stable 1.1.0 CEF (public website link) | Blocked by startup | Restores grants with socket workaround | Fails, exit 134 |
| Main `db775912` WebKit | Pass | Pass and persist across restart | Pass |

The stable CEF failure was reproduced three times. Its stdout ends with:

```text
thread 'main' (2) panicked at src-tauri/src/lib.rs:254:6:
error while running tauri application: Runtime(CreateWindow)
```

The non-persistent command-line permission change proves the released
`fallback-x11` permission is the trigger:

```bash
flatpak run --socket=x11 --nosocket=fallback-x11 \
  dev.stormix.deadlock-mod-manager
```

This is the same failure family fixed by #603/#605 after v1.1.0 was published,
not a new portal failure. Issue #600's Fedora Discover behavior was not directly
reproduced, but the current website does lead users to a bundle that can install
successfully and then fail before creating a window.

## Portal behavior

The KDE picker returned the native Deadlock directory directly because it is
already allowlisted:

```text
file:///home/gabriel/.local/share/Steam/steamapps/common/Deadlock
```

For a fixture under `~/Documents`, the sandbox could not read the raw host
path before selection. The document portal returned persistent, writable
mounts instead:

```text
/run/user/1000/doc/dgPD9CC1xmVNB1lpKnvUFw/Deadlock
/run/user/1000/doc/4to4dtLX8hcJcSrwUL5NPg/Steam
```

Main accepted the game directory after it contained
`game/citadel/gameinfo.gi`, accepted the Steam directory after it contained
`steamapps`, and restored both document paths after real process restarts.
Stable CEF also restored both paths when launched with the socket workaround.
An intentionally invalid game directory was rejected while main stayed alive,
but the application log contained an empty frontend `ERROR`, so current
diagnostics do not preserve the validation reason.

The test host has native Steam only. The backend contains discovery candidates
under `~/.var/app/com.valvesoftware.Steam`, while the manifests do not grant
those locations. That mismatch remains a strong explanation for Bazzite and
Flatpak-Steam autodetection reports, but it was not runtime-confirmed here and
should be tested on a host with Flatpak Steam before changing permissions.

## Environment

- CachyOS (Arch-based), KDE Plasma 6.7.4, Wayland
- Flatpak 1.18.1
- xdg-desktop-portal 1.22.1
- xdg-desktop-portal-kde 6.7.4
- xdg-desktop-portal-gtk 1.15.3
- Stable WebKit SHA-256:
  `d40ebb649a50ca32ab775124be14795c4ae7cfb15891849563c40b858f64fff5`
- Stable CEF SHA-256:
  `1b08c03d1c2d57b45ff364c10adfab00a7ba71ec4eeb7c8b6308ce4182103d82`
- Main WebKit SHA-256:
  `b89d0b09d21e48bac83923f24574fb2f77a3266a1f040762bdf83236a596a64b`

Both stable bundles declare GNOME Platform 49. All tested bundles report
version `1.0.0` from AppStream metadata even though the stable application is
1.1.0. Stable and main also log a failed `xdg-mime` deep-link registration on
every Flatpak launch because that executable is absent from the sandbox.

## Collect diagnostics

The collector is read-only. It records the session, Flatpak and portal
versions, effective permissions, document grants, sandbox-visible Steam paths,
and recent startup/path diagnostics:

```bash
./collect.sh > flatpak-paths.txt
```

To capture the exact folder-picker request and returned URI in another
terminal, run:

```bash
dbus-monitor --session \
  "interface='org.freedesktop.portal.FileChooser'" \
  "interface='org.freedesktop.portal.Request'"
```

Then select the folder in the app and preserve both the collector output and
the DBus trace. Do not use `--filesystem=host` for the baseline; it masks the
boundary being tested.

## Disposition and regression coverage

The current KDE portal crash hypothesis is disproved for both stable WebKit and
main. External portal grants work and persist. MATE/Caja, Steam Deck/Bazzite,
and Flatpak Steam visibility remain explicitly deferred until those
environments are available.

Release CI should install and launch both Flatpak bundles under Wayland/X11,
fail if the process exits before a window remains alive, and assert the
AppStream version matches the package version. The next stable release must
include #605 before the website continues presenting CEF as the default Linux
download. Flatpak startup should also skip redundant runtime `xdg-mime`
registration or package the required command, and path validation errors should
retain a useful reason in the application log.
