# Deadlock Mod Manager

Shared product language for the Deadlock Mod Manager ecosystem.

## Desktop updates

**Update Channel**:
The release feed used to discover future eligible updates. Selecting a channel
does not install an older version or perform a rollback.
_Avoid_: Release track, downgrade channel

**Runtime Variant**:
The embedded browser runtime shipped with the desktop application, currently
Wry or CEF. Runtime variants are distinct update targets.
_Avoid_: Build flavor

**Installer Format**:
The packaging family that installed the desktop application, such as NSIS,
Debian, RPM, Flatpak, AUR, or Nix.
_Avoid_: Platform

**Update Target**:
The exact combination of update channel, runtime variant, operating system,
architecture, and installer format eligible for an update.
_Avoid_: Generic platform

**Testing Channel**:
The nightly update channel intended primarily for maintainers and a small group
of testers. Its artifacts require Tauri signatures but may use test
Authenticode certificates.
_Avoid_: Stable nightly

**Rollback**:
An explicit manual reinstall of an older application version. Changing the
update channel is not a rollback.
_Avoid_: Channel switch
