#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UpdateChannel {
  Stable,
  Nightly,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuntimeKind {
  Wry,
  Cef,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OperatingSystem {
  Windows,
  Linux,
  Unsupported,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Architecture {
  X86_64,
  Aarch64,
  Unsupported,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code, reason = "installer variants are platform-specific")]
pub enum InstallerFormat {
  Nsis,
  Deb,
  Rpm,
  Flatpak,
  Aur,
  Nix,
  Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InstallationStrategy {
  Native,
  Flatpak,
  PackageManager,
  Unsupported,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UpdateTarget {
  pub channel: UpdateChannel,
  pub runtime: RuntimeKind,
  pub operating_system: OperatingSystem,
  pub architecture: Architecture,
  pub installer: InstallerFormat,
  pub installation_strategy: InstallationStrategy,
  pub endpoint: &'static str,
  pub manifest_target: String,
  pub flatpak_asset: Option<&'static str>,
}

const STABLE_ENDPOINT: &str = "https://github.com/deadlock-mod-manager/deadlock-mod-manager/releases/latest/download/latest.json";
const NIGHTLY_ENDPOINT: &str = "https://github.com/deadlock-mod-manager/deadlock-mod-manager/releases/download/nightly/latest.json";
const CEF_STABLE_ENDPOINT: &str = "https://github.com/deadlock-mod-manager/deadlock-mod-manager/releases/latest/download/latest-cef.json";
const CEF_NIGHTLY_ENDPOINT: &str = "https://github.com/deadlock-mod-manager/deadlock-mod-manager/releases/download/nightly/latest-cef.json";

fn platform_name(operating_system: OperatingSystem) -> &'static str {
  match operating_system {
    OperatingSystem::Windows => "windows",
    OperatingSystem::Linux => "linux",
    OperatingSystem::Unsupported => "unsupported",
  }
}

fn architecture_name(architecture: Architecture) -> &'static str {
  match architecture {
    Architecture::X86_64 => "x86_64",
    Architecture::Aarch64 => "aarch64",
    Architecture::Unsupported => "unsupported",
  }
}

fn installer_name(installer: InstallerFormat) -> &'static str {
  match installer {
    InstallerFormat::Nsis => "nsis",
    InstallerFormat::Deb => "deb",
    InstallerFormat::Rpm => "rpm",
    InstallerFormat::Flatpak => "flatpak",
    InstallerFormat::Aur => "aur",
    InstallerFormat::Nix => "nix",
    InstallerFormat::Unknown => "unknown",
  }
}

fn endpoint(channel: UpdateChannel, runtime: RuntimeKind) -> &'static str {
  match (channel, runtime) {
    (UpdateChannel::Stable, RuntimeKind::Wry) => STABLE_ENDPOINT,
    (UpdateChannel::Nightly, RuntimeKind::Wry) => NIGHTLY_ENDPOINT,
    (UpdateChannel::Stable, RuntimeKind::Cef) => CEF_STABLE_ENDPOINT,
    (UpdateChannel::Nightly, RuntimeKind::Cef) => CEF_NIGHTLY_ENDPOINT,
  }
}

fn installation_strategy(
  installer: InstallerFormat,
  flatpak_self_update_verified: bool,
) -> InstallationStrategy {
  match installer {
    InstallerFormat::Nsis | InstallerFormat::Deb | InstallerFormat::Rpm => {
      InstallationStrategy::Native
    }
    InstallerFormat::Flatpak if flatpak_self_update_verified => InstallationStrategy::Flatpak,
    InstallerFormat::Flatpak => InstallationStrategy::PackageManager,
    InstallerFormat::Aur | InstallerFormat::Nix => InstallationStrategy::PackageManager,
    InstallerFormat::Unknown => InstallationStrategy::Unsupported,
  }
}

fn flatpak_asset(runtime: RuntimeKind, installer: InstallerFormat) -> Option<&'static str> {
  if installer != InstallerFormat::Flatpak {
    return None;
  }

  match runtime {
    RuntimeKind::Wry => Some("deadlock-mod-manager.flatpak"),
    RuntimeKind::Cef => Some("deadlock-mod-manager-cef.flatpak"),
  }
}

pub fn resolve_update_target(
  channel: UpdateChannel,
  runtime: RuntimeKind,
  operating_system: OperatingSystem,
  architecture: Architecture,
  installer: InstallerFormat,
  flatpak_self_update_verified: bool,
) -> UpdateTarget {
  let manifest_target = format!(
    "{}-{}-{}",
    platform_name(operating_system),
    architecture_name(architecture),
    installer_name(installer),
  );

  UpdateTarget {
    channel,
    runtime,
    operating_system,
    architecture,
    installer,
    installation_strategy: installation_strategy(installer, flatpak_self_update_verified),
    endpoint: endpoint(channel, runtime),
    manifest_target,
    flatpak_asset: flatpak_asset(runtime, installer),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn native_linux_targets_do_not_fall_back_across_installer_formats() {
    let deb = resolve_update_target(
      UpdateChannel::Stable,
      RuntimeKind::Wry,
      OperatingSystem::Linux,
      Architecture::X86_64,
      InstallerFormat::Deb,
      false,
    );
    let rpm = resolve_update_target(
      UpdateChannel::Stable,
      RuntimeKind::Wry,
      OperatingSystem::Linux,
      Architecture::X86_64,
      InstallerFormat::Rpm,
      false,
    );

    assert_eq!(deb.manifest_target, "linux-x86_64-deb");
    assert_eq!(rpm.manifest_target, "linux-x86_64-rpm");
    assert_ne!(deb.manifest_target, rpm.manifest_target);
  }

  #[test]
  fn runtime_variants_use_separate_manifests_and_flatpak_assets() {
    let wry = resolve_update_target(
      UpdateChannel::Nightly,
      RuntimeKind::Wry,
      OperatingSystem::Linux,
      Architecture::X86_64,
      InstallerFormat::Flatpak,
      true,
    );
    let cef = resolve_update_target(
      UpdateChannel::Nightly,
      RuntimeKind::Cef,
      OperatingSystem::Linux,
      Architecture::X86_64,
      InstallerFormat::Flatpak,
      true,
    );

    assert_ne!(wry.endpoint, cef.endpoint);
    assert_eq!(wry.flatpak_asset, Some("deadlock-mod-manager.flatpak"));
    assert_eq!(cef.flatpak_asset, Some("deadlock-mod-manager-cef.flatpak"));
  }

  #[test]
  fn package_managed_formats_never_use_native_installation() {
    for installer in [InstallerFormat::Aur, InstallerFormat::Nix] {
      let target = resolve_update_target(
        UpdateChannel::Stable,
        RuntimeKind::Wry,
        OperatingSystem::Linux,
        Architecture::X86_64,
        installer,
        false,
      );

      assert_eq!(
        target.installation_strategy,
        InstallationStrategy::PackageManager,
      );
    }
  }

  #[test]
  fn every_channel_runtime_and_installer_combination_is_exact() {
    for channel in [UpdateChannel::Stable, UpdateChannel::Nightly] {
      for runtime in [RuntimeKind::Wry, RuntimeKind::Cef] {
        for (installer, expected_suffix) in [
          (InstallerFormat::Nsis, "nsis"),
          (InstallerFormat::Deb, "deb"),
          (InstallerFormat::Rpm, "rpm"),
          (InstallerFormat::Flatpak, "flatpak"),
          (InstallerFormat::Aur, "aur"),
          (InstallerFormat::Nix, "nix"),
          (InstallerFormat::Unknown, "unknown"),
        ] {
          let target = resolve_update_target(
            channel,
            runtime,
            OperatingSystem::Linux,
            Architecture::Aarch64,
            installer,
            false,
          );

          assert_eq!(
            target.manifest_target,
            format!("linux-aarch64-{expected_suffix}"),
          );
          assert_eq!(target.channel, channel);
          assert_eq!(target.runtime, runtime);
          assert_eq!(target.installer, installer);
        }
      }
    }
  }

  #[test]
  fn flatpak_self_update_fails_closed_without_bundle_verification() {
    let unverified = resolve_update_target(
      UpdateChannel::Stable,
      RuntimeKind::Wry,
      OperatingSystem::Linux,
      Architecture::X86_64,
      InstallerFormat::Flatpak,
      false,
    );
    let verified = resolve_update_target(
      UpdateChannel::Stable,
      RuntimeKind::Wry,
      OperatingSystem::Linux,
      Architecture::X86_64,
      InstallerFormat::Flatpak,
      true,
    );

    assert_eq!(
      unverified.installation_strategy,
      InstallationStrategy::PackageManager,
    );
    assert_eq!(
      verified.installation_strategy,
      InstallationStrategy::Flatpak,
    );
  }
}
