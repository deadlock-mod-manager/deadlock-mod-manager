use super::{display_drivers, gpu_compat_workaround_enabled, nvidia_prime_offload_requested};
use std::{ffi::OsStr, fs, os::unix::fs::symlink, path::Path};

fn add_connector(drm: &Path, name: &str, status: &str, driver: Option<&str>) {
  let (card, _) = name.split_once('-').unwrap();
  let device = drm.join(card).join("device");
  fs::create_dir_all(&device).unwrap();
  if let Some(driver) = driver
    && !device.join("driver").is_symlink()
  {
    symlink(
      format!("/sys/bus/pci/drivers/{driver}"),
      device.join("driver"),
    )
    .unwrap();
  }
  let connector = drm.join(name);
  fs::create_dir_all(&connector).unwrap();
  fs::write(connector.join("status"), status).unwrap();
}

#[test]
fn disabled_prime_values_do_not_request_offload() {
  for value in [None, Some("0"), Some(""), Some("false"), Some("2")] {
    assert!(!nvidia_prime_offload_requested(
      value.map(OsStr::new),
      None,
      None,
    ));
  }
}

#[test]
fn recognizes_each_nvidia_offload_selector() {
  for (offload, vendor, provider) in [
    (Some("1"), None, None),
    (None, Some("nvidia"), None),
    (None, None, Some("NVIDIA-G0")),
    (Some("0"), None, Some("NVIDIA-G1")),
  ] {
    assert!(nvidia_prime_offload_requested(
      offload.map(OsStr::new),
      vendor.map(OsStr::new),
      provider.map(OsStr::new),
    ));
  }
  assert!(!nvidia_prime_offload_requested(
    None,
    Some(OsStr::new("mesa")),
    Some(OsStr::new("")),
  ));
}

#[test]
fn hybrid_detection_ignores_disconnected_nvidia() {
  for integrated_driver in ["amdgpu", "i915", "xe"] {
    let drm = tempfile::tempdir().unwrap();
    add_connector(
      drm.path(),
      "card0-eDP-1",
      "connected\n",
      Some(integrated_driver),
    );
    add_connector(
      drm.path(),
      "card1-HDMI-A-1",
      "disconnected\n",
      Some("nvidia"),
    );
    assert_eq!(display_drivers(drm.path()), [integrated_driver]);
  }
}

#[test]
fn detects_connected_nvidia_and_nouveau_displays() {
  for driver in ["nvidia", "nouveau"] {
    let drm = tempfile::tempdir().unwrap();
    add_connector(drm.path(), "card0-eDP-1", "connected\n", Some("amdgpu"));
    add_connector(drm.path(), "card1-HDMI-A-1", "connected\n", Some(driver));
    let mut drivers = display_drivers(drm.path());
    drivers.sort();
    assert_eq!(drivers, ["amdgpu", driver]);
  }
}

#[test]
fn deduplicates_drivers_and_ignores_unknown_connector_status() {
  let drm = tempfile::tempdir().unwrap();
  add_connector(drm.path(), "card0-DP-1", "connected\n", Some("amdgpu"));
  add_connector(drm.path(), "card0-DP-2", "connected\n", Some("amdgpu"));
  add_connector(drm.path(), "card1-DP-1", "unknown\n", Some("nvidia"));
  assert_eq!(display_drivers(drm.path()), ["amdgpu"]);
}

#[test]
fn unresolved_displays_leave_detection_empty_for_presence_fallback() {
  let drm = tempfile::tempdir().unwrap();
  assert!(display_drivers(&drm.path().join("missing")).is_empty());
  assert!(display_drivers(drm.path()).is_empty());
  add_connector(drm.path(), "card0-DP-1", "connected\n", None);
  assert!(display_drivers(drm.path()).is_empty());
}

fn unexpected_detection() -> bool {
  panic!("explicit settings must not probe GPUs")
}

#[test]
fn force_on_takes_precedence_over_environment() {
  for value in [None, Some("0"), Some("1"), Some("")] {
    assert!(gpu_compat_workaround_enabled(
      false,
      "on",
      value.map(OsStr::new),
      unexpected_detection,
    ));
  }
}

#[test]
fn force_off_does_not_apply_the_workaround() {
  for value in [None, Some("0"), Some("1")] {
    assert!(!gpu_compat_workaround_enabled(
      false,
      "off",
      value.map(OsStr::new),
      unexpected_detection,
    ));
  }
}

#[test]
fn cli_disable_takes_precedence_over_all_settings() {
  for setting in ["auto", "on", "off"] {
    for value in [None, Some("0"), Some("1")] {
      assert!(!gpu_compat_workaround_enabled(
        true,
        setting,
        value.map(OsStr::new),
        unexpected_detection,
      ));
    }
  }
}

#[test]
fn auto_preserves_explicit_environment_values() {
  for value in ["0", "1", "", "false"] {
    assert!(!gpu_compat_workaround_enabled(
      false,
      "auto",
      Some(OsStr::new(value)),
      unexpected_detection,
    ));
  }
}

#[test]
fn auto_without_an_override_uses_gpu_detection() {
  for detected in [false, true] {
    assert_eq!(
      gpu_compat_workaround_enabled(false, "auto", None, || detected),
      detected,
    );
  }
}
