# Interim desktop update compatibility policy

Issue: [Decide the package-aware self-update policy and improvement specification](https://github.com/deadlock-mod-manager/deadlock-mod-manager/issues/636)

## Status

This is an interim compatibility policy. It stabilizes the updater mechanisms
that Deadlock Mod Manager ships today without making a permanent decision about
which installation authority must own every format long term.

The policy is based on the primary-source constraints recorded by #634 and the
live stable/nightly verification recorded by #635.

## Decision summary

- Preserve automatic update checks, but require explicit confirmation before
  every installation or elevation.
- Give all formats consistent update discovery, status, progress, and error
  semantics while retaining package-specific installation mechanisms.
- Resolve updates against an exact update target: channel, runtime variant,
  operating system, architecture, and installer format.
- Never fall back between Wry and CEF or between installer formats.
- Treat channel selection as future update-feed selection, not rollback.
- Keep rollback as a documented manual reinstall that preserves application
  data.
- Treat nightly as a supported testing channel. Nightly artifacts require valid
  Tauri updater signatures but intentionally do not require production
  Authenticode signing.
- Block stable publication when updater validation fails. Nightly artifacts may
  still publish for manual testing, but their updater manifest must not publish
  until it passes validation.

## Format behavior

| Installer format | Update discovery               | Installation behavior                                                                                                                                                            |
| ---------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows NSIS     | In-app stable or nightly check | Tauri downloads the exact NSIS artifact and starts the interactive installer                                                                                                     |
| Direct Debian    | In-app stable or nightly check | Tauri starts the interactive Debian package installation path                                                                                                                    |
| Direct RPM       | In-app stable or nightly check | Tauri starts the interactive RPM package installation path                                                                                                                       |
| Flatpak          | In-app stable or nightly check | Retain the current app-directed bundle flow while repairing exact-runtime selection, integrity verification, installation-scope preservation, permissions, and failure reporting |
| AUR              | In-app availability check      | Explain that the installed AUR package must be updated with the user's package tooling                                                                                           |
| Nix              | In-app availability check      | Explain that the installed Nix package must be updated through its profile or configuration                                                                                      |

The Flatpak row preserves the current product direction for now; it is not a
long-term endorsement of host-side bundle reinstallation. If the application
cannot prove the exact runtime, installation scope, and artifact integrity, it
must stop and offer a manual update path rather than attempting a fallback.

## Channel and runtime rules

Stable and nightly are separate update feeds. Wry and CEF are separate runtime
variants within each feed. Every supported update therefore requires an exact
manifest entry for its update target.

Changing from nightly to stable does not make an older stable version eligible.
The settings UI must explain that the selection affects future updates and that
a restart is required before the new endpoint is used.

Nightly is primarily for maintainers and a small tester group. The UI must label
it as a testing channel and warn that Windows may show trust warnings because
nightly intentionally uses test Authenticode signing. Tauri artifact signature
verification remains mandatory.

## Update experience

Automatic checks may run on launch. An update is installed only after explicit
confirmation; background checks must never silently install, elevate, or
relaunch.

The application must distinguish these outcomes:

1. No newer eligible version exists.
2. The update check failed.
3. A newer version exists, but its exact update target is unavailable.
4. An update is available and ready for confirmation.
5. Download or installation failed.

Failures must identify the selected channel, runtime variant, and installer
format and provide an appropriate manual-download or package-tool action. A
failed request must never be converted into “You are on the latest version.”

Progress logging must be bounded. Production logs retain start, completion,
failure, total bytes, and elapsed time rather than one record per download
chunk.

## Publication invariants

Before a stable updater manifest becomes public:

- every required update target has one exact artifact;
- every artifact URL resolves to an asset on the intended release;
- every native updater artifact has a non-empty, valid Tauri signature;
- stable Windows artifacts have trusted production Authenticode signatures;
- Wry and CEF manifests are generated and validated independently;
- no generic entry can redirect a missing installer or runtime to another one;
- the previous known-good manifest remains available until its replacement is
  ready.

Nightly uses the same structural, URL, runtime, installer, and Tauri-signature
checks. A failed nightly check blocks updater-manifest publication but does not
block publishing artifacts for manual tester access.

## Rollback and recovery

Rollback is a manual reinstall of a chosen older artifact. Recovery guidance
must identify the current installer format, link to the matching artifact, warn
when a Windows nightly build uses test signing, and state that application data
is preserved.

The application must not silently downgrade, reinterpret a channel change as a
rollback, or replace one runtime variant with another during recovery.

## Implementation handoff

The verified backlog is split into focused work:

- #655 validates manifests, exact artifact URLs, signatures, and publication
  ordering.
- #657 bounds updater progress logging and render pressure.
- #658 fixes missing nightly What's New content.
- #659 adds package-aware routing and exact update-target matching.
- #660 separates update failures from the no-update result.
- #661 clarifies testing-channel trust, feed selection, and manual rollback.

#656 is superseded by the intentional testing-channel policy: production
Authenticode signing is not required for nightly at this time.
