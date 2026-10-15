use serde::Serialize;
use std::time::Duration;
use tauri::{Manager, utils::config::BundleType};
use tauri_plugin_updater::UpdaterExt;

use crate::app_runtime::AppRuntime;
use crate::updater_channel::{self, UpdateChannel};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateContext {
  channel: UpdateChannel,
  runtime: &'static str,
  installer: String,
  target: String,
}

impl UpdateContext {
  fn new(channel: UpdateChannel, bundle: Option<BundleType>, flatpak: bool) -> Self {
    let installer = if flatpak {
      "flatpak".to_string()
    } else {
      bundle.map_or_else(|| "unpackaged".to_string(), |bundle| bundle.to_string())
    };
    let os = if cfg!(target_os = "macos") {
      "darwin"
    } else {
      std::env::consts::OS
    };
    let arch = match std::env::consts::ARCH {
      "x86" => "i686",
      "arm" => "armv7",
      arch => arch,
    };
    let target = format!("{os}-{arch}");
    let target = if installer == "unpackaged" {
      target
    } else {
      format!("{target}-{installer}")
    };
    Self {
      channel,
      runtime: if cfg!(feature = "cef") { "cef" } else { "wry" },
      installer,
      target,
    }
  }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMetadata {
  rid: tauri::ResourceId,
  current_version: String,
  version: String,
  date: Option<String>,
  body: Option<String>,
  raw_json: serde_json::Value,
}

#[derive(Serialize)]
#[serde(tag = "status", rename_all = "kebab-case")]
pub enum UpdateCheckOutcome {
  NoUpdate,
  Available { metadata: UpdateMetadata },
  CheckFailed { message: String },
  MissingTarget { message: String },
}

impl UpdateCheckOutcome {
  fn failed(error: tauri_plugin_updater::Error) -> Self {
    let message = error.to_string();
    match error {
      tauri_plugin_updater::Error::TargetNotFound(_)
      | tauri_plugin_updater::Error::TargetsNotFound(_) => Self::MissingTarget { message },
      _ => Self::CheckFailed { message },
    }
  }
}

#[derive(Serialize)]
pub struct UpdateCheckResponse {
  context: UpdateContext,
  #[serde(flatten)]
  outcome: UpdateCheckOutcome,
}

#[tauri::command]
pub async fn check_app_update(webview: tauri::Webview<AppRuntime>) -> UpdateCheckResponse {
  let context = UpdateContext::new(
    updater_channel::resolve_channel(&webview.config().identifier),
    tauri::utils::platform::bundle_type(),
    crate::flatpak::running_in_flatpak(),
  );
  let check = async {
    let mut builder = webview
      .updater_builder()
      .target(&context.target)
      .timeout(Duration::from_secs(30));
    // Fixture endpoints are configured by the isolated E2E runtime.
    if !crate::runtime_environment::is_e2e_active() {
      builder = builder.endpoints(vec![
        updater_channel::endpoint_for(&context.channel).parse()?,
      ])?;
    }
    if context.channel == UpdateChannel::Nightly {
      builder = builder.version_comparator(|current, release| release.version != current);
    }
    builder.build()?.check().await
  };
  let outcome = match check.await {
    Ok(Some(update)) => {
      let metadata = UpdateMetadata {
        current_version: update.current_version.clone(),
        version: update.version.clone(),
        date: update.date.and_then(|date| {
          chrono::DateTime::from_timestamp(date.unix_timestamp(), date.nanosecond())
            .map(|date| date.to_rfc3339())
        }),
        body: update.body.clone(),
        raw_json: update.raw_json.clone(),
        rid: webview.resources_table().add(update),
      };
      UpdateCheckOutcome::Available { metadata }
    }
    Ok(None) => UpdateCheckOutcome::NoUpdate,
    Err(error) => UpdateCheckOutcome::failed(error),
  };
  UpdateCheckResponse { context, outcome }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn missing_targets_are_distinct_from_check_failures() {
    assert!(matches!(
      UpdateCheckOutcome::failed(tauri_plugin_updater::Error::TargetNotFound(
        "linux-x86_64-deb".into()
      )),
      UpdateCheckOutcome::MissingTarget { .. }
    ));
    assert!(matches!(
      UpdateCheckOutcome::failed(tauri_plugin_updater::Error::TargetsNotFound(vec![])),
      UpdateCheckOutcome::MissingTarget { .. }
    ));
    assert!(matches!(
      UpdateCheckOutcome::failed(tauri_plugin_updater::Error::ReleaseNotFound),
      UpdateCheckOutcome::CheckFailed { .. }
    ));
  }

  #[test]
  fn invalid_manifests_reach_the_frontend_as_check_failures() {
    let error = serde_json::from_str::<tauri_plugin_updater::RemoteRelease>(
      r#"{"version":"not-a-version","platforms":{}}"#,
    )
    .unwrap_err();
    let response = UpdateCheckResponse {
      context: UpdateContext::new(UpdateChannel::Stable, Some(BundleType::Deb), false),
      outcome: UpdateCheckOutcome::failed(error.into()),
    };
    let json = serde_json::to_value(response).unwrap();
    assert_eq!(json["status"], "check-failed");
    assert_eq!(json["context"]["channel"], "stable");
    assert_eq!(json["context"]["installer"], "deb");
    assert!(!json["message"].as_str().unwrap().is_empty());
  }

  #[test]
  fn package_context_identifies_the_exact_installer() {
    let deb = UpdateContext::new(UpdateChannel::Nightly, Some(BundleType::Deb), false);
    assert!(deb.target.ends_with("-deb"));
    assert_eq!(deb.installer, "deb");
    assert_eq!(deb.channel, UpdateChannel::Nightly);
    let flatpak = UpdateContext::new(UpdateChannel::Stable, Some(BundleType::Deb), true);
    assert!(flatpak.target.ends_with("-flatpak"));
    assert_eq!(flatpak.installer, "flatpak");
  }
}
