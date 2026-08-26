# Self-update constraints by distribution channel

Issue: [Research self-update constraints for every distribution channel](https://github.com/deadlock-mod-manager/deadlock-mod-manager/issues/634)

## Decision summary

Deadlock Mod Manager (DMM) should treat the installer or package manager that
created an installation as the authority that updates it.

- Keep in-app self-update for the Windows NSIS distribution, conditional on
  both Tauri updater signatures and Windows code signing.
- Do not perform silent in-app replacement for Flatpak, AUR/pacman, or Nix
  installations. Hand those installations back to their package manager.
- Treat direct-download Debian and RPM self-update as transitional and
  interactive. Tauri preserves package-database ownership by invoking `dpkg`
  or `rpm`, but those low-level commands do not provide the dependency and
  repository guarantees of APT or DNF.
- Give Wry and CEF separate, complete update metadata for every supported
  stable/nightly and package-format combination. Never fall back from one
  runtime to the other.

This is the conservative compatibility rule: an update is eligible only when
the running app can identify its runtime, release channel, installer format,
installation scope, and the exact signed artifact for that tuple.

## Constraint matrix

| Distribution  | Update authority                               | Privilege boundary                                                                            | Integrity and package state                                                                                                   | Recommended DMM behavior                                                                                   |
| ------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Windows NSIS  | DMM/Tauri updater                              | Current-user installs normally need no elevation; per-machine installs do                     | Tauri's update signature is mandatory; Authenticode is a separate Windows trust control                                       | Support in-app update with an exact channel/runtime/architecture manifest and preserve install scope       |
| Direct `.deb` | `dpkg` today; preferably APT/repository        | Tauri escalates through `pkexec`, a graphical password prompt plus `sudo`, or terminal `sudo` | `dpkg -i` records the package but can fail on dependencies or leave a partially configured state                              | Keep interactive and transitional; prefer a signed APT repository or invoke the high-level package manager |
| Direct `.rpm` | `rpm` today; preferably DNF/repository         | Same Tauri escalation path as Debian                                                          | `rpm -U` records the package but refuses unresolved dependencies and does not fetch them                                      | Keep interactive and transitional; prefer a signed repository/DNF path                                     |
| Flatpak       | Configured Flatpak remote                      | Host `flatpak` service/CLI, outside the application sandbox                                   | OSTree remote metadata and GPG policy provide the update chain; a downloaded single-file bundle is not equivalent to a remote | Remove the host-side bundle reinstall path; direct users or a software center to `flatpak update`          |
| Arch/AUR      | PKGBUILD rebuild followed by pacman/AUR helper | Package build is unprivileged; pacman installation normally elevates                          | Pacman owns the package database and verifies configured package signatures                                                   | Build with app self-update disabled and tell the user/package helper that an update is available           |
| Nix           | Flake/channel/profile or NixOS configuration   | Nix daemon/profile policy                                                                     | Nix store objects are immutable; profiles provide generations and rollback                                                    | Continue shipping with app self-update disabled and update through Nix                                     |

## Shared Tauri updater constraints

Tauri's updater requires signed update artifacts and states that signature
verification cannot be disabled. Its static JSON format requires a version,
download URL, and signature, and production endpoints must use TLS. Platform
entries are selected first by `{os}-{arch}-{installer}` and then by the less
specific `{os}-{arch}` fallback. The updater verifies the downloaded bytes
against the configured public key before installation. These behaviors make a
generic Linux fallback unsafe when multiple package formats or runtimes exist.
See the [Tauri updater documentation](https://v2.tauri.app/plugin/updater/) and
[updater implementation](https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/updater/src/updater.rs).

Tauri uses semantic-version comparison. Stable and nightly therefore need
explicit channel policy; changing endpoint alone does not guarantee that a
version from the other channel compares as an upgrade. A channel change should
be a deliberate operation with a defined downgrade/sidegrade behavior, not an
accidental consequence of a fallback manifest.

Update publication should be atomic from the client's perspective: publish all
expected artifacts and signatures first, validate their URLs, then publish the
manifest. DMM's release action currently deletes and re-uploads `latest.json`,
which creates a transient missing-manifest window
([release metadata action](../../.github/actions/update-latest-json/action.yml)).

## Windows NSIS

Tauri's default NSIS installation mode is per-user under `LOCALAPPDATA`, while
`perMachine` and `both` modes require administrator access. DMM can safely keep
the update flow in-process when the updater launches the matching NSIS
installer, preserves the original scope, and exposes installer failures to the
user. The project's `basicUi` updater install mode is appropriate for an
interactive desktop update, but must be tested for user and administrator
installations. See [Tauri's Windows installer documentation](https://v2.tauri.app/distribute/windows-installer/).

Tauri's minisign-style update signature authenticates the bytes to the app;
Windows code signing establishes publisher reputation for SmartScreen and the
operating system. DMM needs both controls, not one in place of the other. See
[Tauri's Windows code-signing documentation](https://v2.tauri.app/distribute/sign/windows/).

## Debian and RPM

The current Tauri updater implementation installs Debian packages using
`dpkg -i` and RPM packages using `rpm -U`. It tries `pkexec`, then graphical
password input piped to `sudo`, then terminal `sudo`
([Tauri updater source](https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/updater/src/updater.rs)).
This is materially safer than overwriting the executable because package
ownership remains represented in the native database, but it is not the same as
updating through the distribution's high-level package manager.

Debian documents that `dpkg` only handles the packages it is given and that
dependency resolution belongs to tools such as APT. APT can install a local
package with `apt install ./package.deb` while resolving dependencies. APT's
repository trust chain signs Release metadata and checks package checksums; it
does not rely on a per-package signature. See the
[Debian Handbook on dpkg](https://www.debian.org/doc/manuals/debian-handbook/sect.manipulating-packages-with-dpkg.en.html),
[APT local-package behavior](https://www.debian.org/doc/manuals/debian-handbook/sect.apt-get.en.html),
and [`apt-secure`](https://manpages.debian.org/unstable/apt/apt-secure.8.en.html).

RPM similarly refuses unmet dependencies without fetching them. Fedora directs
users to DNF for normal package operations because it resolves dependencies and
uses repository policy. Local-package signature checking is also a DNF policy
choice (`localpkg_gpgcheck`), separate from Tauri's artifact signature. See the
[RPM dependency documentation](https://rpm.org/docs/latest/manual/more_dependencies.html),
[RPM command reference](https://man7.org/linux/man-pages/man8/rpm.8.html), and
[DNF configuration reference](https://dnf.readthedocs.io/en/latest/conf_ref.html#localpkg-gpgcheck-label).

Until DMM publishes signed APT and RPM repositories, direct-package updating
should remain visible, cancellable, and failure-aware. It must never claim
success until the native command exits successfully and the installed version
is re-read. Repository-backed updates are the preferred end state.

## Flatpak

Flatpak recommends a repository for distribution because repositories provide
normal updates and efficient deltas; single-file bundles omit repository
benefits and dependency metadata. `flatpak update` updates installed refs from
their configured remotes. See the Flatpak documentation for
[single-file bundles](https://docs.flatpak.org/en/latest/single-file-bundles.html),
[repositories](https://docs.flatpak.org/en/latest/repositories.html), and
[`flatpak update`](https://man7.org/linux/man-pages/man1/flatpak-update.1.html).

DMM's current Flatpak path downloads a `.flatpak` release asset and invokes
`flatpak-spawn --host flatpak install --reinstall --noninteractive`
([command implementation](../../apps/desktop/src-tauri/src/flatpak.rs)). This
has four problems:

1. `--host` deliberately crosses the sandbox boundary. Flatpak describes access
   to `org.freedesktop.Flatpak`/host spawning as equivalent to arbitrary host
   command execution and suitable only for specially trusted apps
   ([Flatpak security advisory](https://github.com/flatpak/flatpak/security/advisories/GHSA-4ppf-fxf6-vxg2)).
2. `flatpak install` defaults to the system installation unless `--user` is
   selected, so the current command does not preserve the user's installation
   scope. `--reinstall` first uninstalls the installed ref
   ([`flatpak install` reference](https://man7.org/linux/man-pages/man1/flatpak-install.1.html)).
3. The code validates the GitHub URL shape but not a Tauri signature or digest,
   and current Flatpak entries in `latest.json` have an empty signature.
4. The URL builder always selects the Wry Flatpak asset, so a CEF Flatpak can be
   cross-graded to Wry
   ([desktop update hook](../../apps/desktop/src/hooks/use-update-manager.ts)).

The safe design is a signed Flatpak remote and package-manager-driven update.
DMM may detect an available version and explain how to update, but it should not
request a broad host escape in order to reinstall a downloaded bundle.

## Arch/AUR and Nix

The AUR distributes build instructions rather than repository packages. Arch
requires users to inspect a PKGBUILD, build it with `makepkg`, and install the
result through pacman; AUR packages remain the user's responsibility to update.
Pacman owns dependency and package-database state, and Arch does not support
partial system upgrades. See the [AUR documentation](https://wiki.archlinux.org/title/Arch_User_Repository),
[pacman manual](https://man.archlinux.org/man/pacman.8.en), and
[Arch maintenance guidance](https://wiki.archlinux.org/title/System_maintenance).

DMM's AUR recipes build with `tauri build --no-bundle` but do not currently pass
`--disable-auto-update` ([AUR packaging](../../distribution/aur)). That flag
must be added. If such a build reaches Tauri's generic Linux/AppImage
replacement path, it could change a pacman-owned executable without updating
the package database; the exact compiled bundle-type behavior is a release-test
gate, not a behavior to rely on.

Nix store objects are immutable, and Nix profiles/configurations provide
upgrade and rollback semantics. An application cannot safely replace its own
store path. DMM's Nix package already disables updater artifacts and launches
with `--disable-auto-update` ([Nix package](../../package.nix)); retain that
behavior. See the Nix documentation for
[store object immutability](https://nix.dev/manual/nix/2.19/store/store-object)
and [profile upgrades](https://releases.nixos.org/nix/nix-2.19.2/manual/command-ref/new-cli/nix3-profile-upgrade.html).

## Current release-channel findings

The checked release state on 2026-08-26 exposes correctness failures that
should block claiming full updater support:

- Stable `v1.1.0` has Wry `latest.json` but no `latest-cef.json`; both stable
  and nightly CEF metadata URLs return 404. Stable does contain a CEF Flatpak,
  so the artifact set and metadata set disagree. See the
  [stable release](https://github.com/deadlock-mod-manager/deadlock-mod-manager/releases/tag/v1.1.0).
- The fixed `nightly` release has no CEF artifacts. Its Wry
  [`latest.json`](https://github.com/deadlock-mod-manager/deadlock-mod-manager/releases/download/nightly/latest.json)
  points its Debian and RPM entries at numeric download paths that return 404,
  rather than at the uploaded asset names. See the
  [nightly release](https://github.com/deadlock-mod-manager/deadlock-mod-manager/releases/tag/nightly).
- GitHub defines `latest` as the most recent non-draft, non-prerelease release,
  so a generic latest-release URL cannot implement the nightly channel. See
  [GitHub's release API documentation](https://docs.github.com/en/rest/releases/releases#get-the-latest-release).

Required publication invariants are therefore:

1. Every supported tuple of channel, runtime, operating system, architecture,
   and installer format has exactly one expected artifact.
2. Every native-updater artifact has a non-empty Tauri signature, and Windows
   artifacts are also code-signed.
3. Each manifest URL resolves successfully before the manifest is published;
   CI parses the manifest and downloads/verifies every referenced artifact.
4. A missing installer-specific or runtime-specific entry is an unsupported
   update with a clear message, never permission to use a generic fallback.

## Remaining validation gates

The sources establish the policy boundaries, but release qualification still
needs local-first tests for: NSIS user/per-machine elevation and rollback;
Debian/RPM cancellation and partial-install recovery across supported desktops;
stable/nightly switching under the chosen version scheme; package-scope
detection for Flatpak; and verification that AUR/Nix builds cannot invoke the
native updater. These are compatibility-matrix test cases, not reasons to keep
unsafe fallback behavior enabled.
