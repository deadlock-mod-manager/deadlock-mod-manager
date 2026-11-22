# Omit RPM packages from nightly builds

Tauri CLI rejects the semver nightly suffix in RPM builds, while the RPM-compatible tilde is incompatible with the application's semver. Keep nightly distribution available in the other supported formats.
