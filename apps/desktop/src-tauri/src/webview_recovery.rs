use crate::app_runtime::{AppHandle, AppRuntime};
use serde::Serialize;
use std::{
  collections::VecDeque,
  fs,
  path::{Path, PathBuf},
  sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
  },
  thread,
  time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::Manager;
use webview2_com::{
  BrowserProcessExitedEventHandler,
  Microsoft::Web::WebView2::Win32::{
    COREWEBVIEW2_BROWSER_PROCESS_EXIT_KIND_FAILED, COREWEBVIEW2_BROWSER_PROCESS_EXIT_KIND_NORMAL,
    COREWEBVIEW2_PROCESS_FAILED_KIND, COREWEBVIEW2_PROCESS_FAILED_KIND_BROWSER_PROCESS_EXITED,
    COREWEBVIEW2_PROCESS_FAILED_KIND_FRAME_RENDER_PROCESS_EXITED,
    COREWEBVIEW2_PROCESS_FAILED_KIND_GPU_PROCESS_EXITED,
    COREWEBVIEW2_PROCESS_FAILED_KIND_PPAPI_BROKER_PROCESS_EXITED,
    COREWEBVIEW2_PROCESS_FAILED_KIND_PPAPI_PLUGIN_PROCESS_EXITED,
    COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED,
    COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_UNRESPONSIVE,
    COREWEBVIEW2_PROCESS_FAILED_KIND_SANDBOX_HELPER_PROCESS_EXITED,
    COREWEBVIEW2_PROCESS_FAILED_KIND_UNKNOWN_PROCESS_EXITED,
    COREWEBVIEW2_PROCESS_FAILED_KIND_UTILITY_PROCESS_EXITED, COREWEBVIEW2_PROCESS_FAILED_REASON,
    COREWEBVIEW2_PROCESS_FAILED_REASON_CRASHED, COREWEBVIEW2_PROCESS_FAILED_REASON_LAUNCH_FAILED,
    COREWEBVIEW2_PROCESS_FAILED_REASON_OUT_OF_MEMORY,
    COREWEBVIEW2_PROCESS_FAILED_REASON_PROFILE_DELETED,
    COREWEBVIEW2_PROCESS_FAILED_REASON_TERMINATED, COREWEBVIEW2_PROCESS_FAILED_REASON_UNEXPECTED,
    COREWEBVIEW2_PROCESS_FAILED_REASON_UNRESPONSIVE, ICoreWebView2, ICoreWebView2Environment5,
    ICoreWebView2Environment11, ICoreWebView2ProcessFailedEventArgs2,
  },
  ProcessFailedEventHandler, take_pwstr,
};
use windows::{
  Win32::{
    Graphics::Direct3D11::ID3D11Device,
    Graphics::Dxgi::{CreateDXGIFactory1, IDXGIAdapter1, IDXGIFactory1},
    UI::WindowsAndMessaging::{MB_ICONERROR, MB_OK, MessageBoxW},
  },
  core::{Interface, PCWSTR, PWSTR},
};

const MAIN_WINDOW_LABEL: &str = "main";
const RELOAD_LIMIT: usize = 2;
const RELOAD_WINDOW_MS: u64 = 60_000;
const RESTART_GUARD_TTL: Duration = Duration::from_secs(120);
const RESTART_MARKER_NAME: &str = "webview2-recovery-restart";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum FailureKind {
  BrowserProcessExited,
  FrameRenderProcessExited,
  GpuProcessExited,
  RenderProcessExited,
  RenderProcessUnresponsive,
  SandboxHelperProcessExited,
  UtilityProcessExited,
  PluginProcessExited,
  UnknownProcessExited,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum RecoveryAction {
  Reload,
  AwaitBrowserExit,
  Restart,
  Observe,
}

#[derive(Default)]
struct RecoveryPolicy {
  renderer_failures: VecDeque<u64>,
}

impl RecoveryPolicy {
  fn action(&mut self, kind: FailureKind, now_ms: u64) -> RecoveryAction {
    match kind {
      FailureKind::BrowserProcessExited => RecoveryAction::AwaitBrowserExit,
      FailureKind::GpuProcessExited
      | FailureKind::FrameRenderProcessExited
      | FailureKind::SandboxHelperProcessExited
      | FailureKind::UtilityProcessExited
      | FailureKind::PluginProcessExited
      | FailureKind::UnknownProcessExited => RecoveryAction::Observe,
      FailureKind::RenderProcessExited | FailureKind::RenderProcessUnresponsive => {
        while self
          .renderer_failures
          .front()
          .is_some_and(|timestamp| now_ms.saturating_sub(*timestamp) > RELOAD_WINDOW_MS)
        {
          self.renderer_failures.pop_front();
        }

        self.renderer_failures.push_back(now_ms);
        if self.renderer_failures.len() <= RELOAD_LIMIT {
          RecoveryAction::Reload
        } else {
          RecoveryAction::Restart
        }
      }
    }
  }
}

#[derive(Clone, Serialize)]
struct GpuAdapterDiagnostic {
  description: String,
  vendor_id: u32,
  device_id: u32,
  subsystem_id: u32,
  revision: u32,
  driver_version: Option<String>,
}

#[derive(Serialize)]
struct ProcessFailureDiagnostic<'a> {
  event: &'static str,
  failure_kind: &'static str,
  reason: Option<&'static str>,
  exit_code: Option<i32>,
  process_description: Option<String>,
  webview2_runtime_version: &'a str,
  gpu_adapters: &'a [GpuAdapterDiagnostic],
  failure_report_folder: Option<&'a str>,
  recovery_action: &'static str,
}

#[derive(Serialize)]
struct BrowserExitDiagnostic<'a> {
  event: &'static str,
  exit_kind: &'static str,
  browser_process_id: u32,
  webview2_runtime_version: &'a str,
  gpu_adapters: &'a [GpuAdapterDiagnostic],
  failure_report_folder: Option<&'a str>,
  recovery_action: &'static str,
}

struct RecoveryState {
  app: AppHandle,
  policy: Mutex<RecoveryPolicy>,
  restart_requested: AtomicBool,
  restart_marker: PathBuf,
  runtime_version: String,
  failure_report_folder: Option<String>,
  gpu_adapters: Vec<GpuAdapterDiagnostic>,
}

pub fn setup(app: &tauri::App<AppRuntime>) -> Result<(), Box<dyn std::error::Error>> {
  let window = app
    .get_webview_window(MAIN_WINDOW_LABEL)
    .ok_or("main WebView window was not created")?;
  let restart_marker = app.path().app_local_data_dir()?.join(RESTART_MARKER_NAME);
  let previous_restart_pending = has_recent_restart_marker(&restart_marker);

  if previous_restart_pending {
    schedule_restart_guard_cleanup(restart_marker.clone());
  }

  let app_handle = app.handle().clone();
  window.with_webview(move |platform_webview| {
    let environment = platform_webview.environment();
    let controller = platform_webview.controller();
    let webview = unsafe { controller.CoreWebView2() };

    let webview = match webview {
      Ok(webview) => webview,
      Err(error) => {
        log::error!(target: "webview2_recovery", "failed to access the main CoreWebView2 instance: {error}");
        return;
      }
    };

    let state = Arc::new(RecoveryState {
      app: app_handle,
      policy: Mutex::new(RecoveryPolicy::default()),
      restart_requested: AtomicBool::new(false),
      restart_marker,
      runtime_version: runtime_version(&environment),
      failure_report_folder: failure_report_folder(&environment),
      gpu_adapters: gpu_inventory(),
    });

    if let Err(error) = register_process_failed_handler(&webview, Arc::clone(&state)) {
      log::error!(target: "webview2_recovery", "failed to register WebView2 ProcessFailed handler: {error}");
    }

    if let Err(error) = register_browser_exited_handler(&environment, state) {
      log::error!(target: "webview2_recovery", "failed to register WebView2 BrowserProcessExited handler: {error}");
    }
  })?;

  Ok(())
}

fn register_process_failed_handler(
  webview: &ICoreWebView2,
  state: Arc<RecoveryState>,
) -> windows::core::Result<()> {
  let handler = ProcessFailedEventHandler::create(Box::new(move |sender, args| {
    let Some(args) = args else {
      log::error!(target: "webview2_recovery", "ProcessFailed callback did not include event arguments");
      return Ok(());
    };

    let mut raw_kind = COREWEBVIEW2_PROCESS_FAILED_KIND(0);
    unsafe { args.ProcessFailedKind(&mut raw_kind)? };
    let kind = failure_kind(raw_kind);
    let now_ms = unix_time_ms();
    let action = state
      .policy
      .lock()
      .map(|mut policy| policy.action(kind, now_ms))
      .unwrap_or(RecoveryAction::Restart);
    let (reason, exit_code, process_description) = process_failure_details(&args);

    log_process_failure(&state, kind, reason, exit_code, process_description, action);

    match action {
      RecoveryAction::Reload => {
        if let Some(sender) = sender {
          if let Err(error) = unsafe { sender.Reload() } {
            log::error!(target: "webview2_recovery", "native WebView2 reload failed: {error}");
            request_controlled_restart(&state);
          }
        } else {
          request_controlled_restart(&state);
        }
      }
      RecoveryAction::Restart => request_controlled_restart(&state),
      RecoveryAction::AwaitBrowserExit | RecoveryAction::Observe => {}
    }

    Ok(())
  }));
  let mut token = 0;
  unsafe { webview.add_ProcessFailed(&handler, &mut token) }
}

fn register_browser_exited_handler(
  environment: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Environment,
  state: Arc<RecoveryState>,
) -> windows::core::Result<()> {
  let environment5: ICoreWebView2Environment5 = environment.cast()?;
  let handler = BrowserProcessExitedEventHandler::create(Box::new(move |_sender, args| {
    let Some(args) = args else {
      log::error!(target: "webview2_recovery", "BrowserProcessExited callback did not include event arguments");
      return Ok(());
    };

    let mut exit_kind = COREWEBVIEW2_BROWSER_PROCESS_EXIT_KIND_NORMAL;
    let mut browser_process_id = 0;
    unsafe {
      args.BrowserProcessExitKind(&mut exit_kind)?;
      args.BrowserProcessId(&mut browser_process_id)?;
    }
    let action = if exit_kind == COREWEBVIEW2_BROWSER_PROCESS_EXIT_KIND_FAILED {
      RecoveryAction::Restart
    } else {
      RecoveryAction::Observe
    };
    log_browser_exit(&state, exit_kind, browser_process_id, action);

    if action == RecoveryAction::Restart {
      request_controlled_restart(&state);
    }

    Ok(())
  }));
  let mut token = 0;
  unsafe { environment5.add_BrowserProcessExited(&handler, &mut token) }
}

fn request_controlled_restart(state: &RecoveryState) {
  if state.restart_requested.swap(true, Ordering::AcqRel) {
    return;
  }

  if has_recent_restart_marker(&state.restart_marker) {
    log::error!(target: "webview2_recovery", "WebView2 recovery stopped after a second failure inside the restart guard window");
    show_crash_loop_message(state.failure_report_folder.as_deref());
    state.app.exit(1);
    return;
  }

  if let Some(parent) = state.restart_marker.parent()
    && let Err(error) = fs::create_dir_all(parent) {
      log::error!(target: "webview2_recovery", "failed to create restart marker directory: {error}");
    }
  if let Err(error) = fs::write(&state.restart_marker, unix_time_ms().to_string()) {
    log::error!(target: "webview2_recovery", "failed to persist WebView2 restart guard: {error}");
  }

  log::warn!(target: "webview2_recovery", "requesting one controlled application restart after WebView2 failure");
  state.app.request_restart();
}

fn has_recent_restart_marker(path: &Path) -> bool {
  let now_ms = unix_time_ms();
  let restart_ms = fs::read_to_string(path)
    .ok()
    .and_then(|value| value.trim().parse::<u64>().ok());
  let recent = restart_ms.is_some_and(|timestamp| {
    now_ms.saturating_sub(timestamp) <= RESTART_GUARD_TTL.as_millis() as u64
  });

  if !recent && path.exists() {
    let _ = fs::remove_file(path);
  }
  recent
}

fn schedule_restart_guard_cleanup(path: PathBuf) {
  thread::spawn(move || {
    thread::sleep(RESTART_GUARD_TTL);
    if let Err(error) = fs::remove_file(&path)
      && error.kind() != std::io::ErrorKind::NotFound {
        log::warn!(target: "webview2_recovery", "failed to clear WebView2 restart guard: {error}");
      }
  });
}

fn runtime_version(
  environment: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Environment,
) -> String {
  let mut version = PWSTR::null();
  unsafe { environment.BrowserVersionString(&mut version) }
    .map(|()| take_pwstr(version))
    .unwrap_or_else(|error| format!("unavailable ({error})"))
}

fn failure_report_folder(
  environment: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Environment,
) -> Option<String> {
  let environment11: ICoreWebView2Environment11 = environment.cast().ok()?;
  let mut folder = PWSTR::null();
  unsafe { environment11.FailureReportFolderPath(&mut folder) }
    .ok()
    .map(|()| take_pwstr(folder))
    .filter(|path| !path.is_empty())
}

fn process_failure_details(
  args: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2ProcessFailedEventArgs,
) -> (Option<&'static str>, Option<i32>, Option<String>) {
  let Ok(args2) = args.cast::<ICoreWebView2ProcessFailedEventArgs2>() else {
    return (None, None, None);
  };
  let mut raw_reason = COREWEBVIEW2_PROCESS_FAILED_REASON(0);
  let reason = unsafe { args2.Reason(&mut raw_reason) }
    .ok()
    .map(|()| failure_reason(raw_reason));
  let mut exit_code = 0;
  let exit_code = unsafe { args2.ExitCode(&mut exit_code) }
    .ok()
    .map(|()| exit_code);
  let mut description = PWSTR::null();
  let process_description = unsafe { args2.ProcessDescription(&mut description) }
    .ok()
    .map(|()| take_pwstr(description))
    .filter(|value| !value.is_empty());
  (reason, exit_code, process_description)
}

fn failure_kind(kind: COREWEBVIEW2_PROCESS_FAILED_KIND) -> FailureKind {
  if kind == COREWEBVIEW2_PROCESS_FAILED_KIND_BROWSER_PROCESS_EXITED {
    FailureKind::BrowserProcessExited
  } else if kind == COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED {
    FailureKind::RenderProcessExited
  } else if kind == COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_UNRESPONSIVE {
    FailureKind::RenderProcessUnresponsive
  } else if kind == COREWEBVIEW2_PROCESS_FAILED_KIND_GPU_PROCESS_EXITED {
    FailureKind::GpuProcessExited
  } else if kind == COREWEBVIEW2_PROCESS_FAILED_KIND_FRAME_RENDER_PROCESS_EXITED {
    FailureKind::FrameRenderProcessExited
  } else if kind == COREWEBVIEW2_PROCESS_FAILED_KIND_SANDBOX_HELPER_PROCESS_EXITED {
    FailureKind::SandboxHelperProcessExited
  } else if kind == COREWEBVIEW2_PROCESS_FAILED_KIND_UTILITY_PROCESS_EXITED {
    FailureKind::UtilityProcessExited
  } else if kind == COREWEBVIEW2_PROCESS_FAILED_KIND_PPAPI_BROKER_PROCESS_EXITED
    || kind == COREWEBVIEW2_PROCESS_FAILED_KIND_PPAPI_PLUGIN_PROCESS_EXITED
  {
    FailureKind::PluginProcessExited
  } else if kind == COREWEBVIEW2_PROCESS_FAILED_KIND_UNKNOWN_PROCESS_EXITED {
    FailureKind::UnknownProcessExited
  } else {
    FailureKind::UnknownProcessExited
  }
}

fn failure_kind_name(kind: FailureKind) -> &'static str {
  match kind {
    FailureKind::BrowserProcessExited => "browserProcessExited",
    FailureKind::FrameRenderProcessExited => "frameRenderProcessExited",
    FailureKind::GpuProcessExited => "gpuProcessExited",
    FailureKind::RenderProcessExited => "renderProcessExited",
    FailureKind::RenderProcessUnresponsive => "renderProcessUnresponsive",
    FailureKind::SandboxHelperProcessExited => "sandboxHelperProcessExited",
    FailureKind::UtilityProcessExited => "utilityProcessExited",
    FailureKind::PluginProcessExited => "pluginProcessExited",
    FailureKind::UnknownProcessExited => "unknownProcessExited",
  }
}

fn failure_reason(reason: COREWEBVIEW2_PROCESS_FAILED_REASON) -> &'static str {
  if reason == COREWEBVIEW2_PROCESS_FAILED_REASON_UNEXPECTED {
    "unexpected"
  } else if reason == COREWEBVIEW2_PROCESS_FAILED_REASON_UNRESPONSIVE {
    "unresponsive"
  } else if reason == COREWEBVIEW2_PROCESS_FAILED_REASON_TERMINATED {
    "terminated"
  } else if reason == COREWEBVIEW2_PROCESS_FAILED_REASON_CRASHED {
    "crashed"
  } else if reason == COREWEBVIEW2_PROCESS_FAILED_REASON_LAUNCH_FAILED {
    "launchFailed"
  } else if reason == COREWEBVIEW2_PROCESS_FAILED_REASON_OUT_OF_MEMORY {
    "outOfMemory"
  } else if reason == COREWEBVIEW2_PROCESS_FAILED_REASON_PROFILE_DELETED {
    "profileDeleted"
  } else {
    "unknown"
  }
}

fn recovery_action_name(action: RecoveryAction) -> &'static str {
  match action {
    RecoveryAction::Reload => "reload",
    RecoveryAction::AwaitBrowserExit => "awaitBrowserExit",
    RecoveryAction::Restart => "restart",
    RecoveryAction::Observe => "observe",
  }
}

fn log_process_failure(
  state: &RecoveryState,
  kind: FailureKind,
  reason: Option<&'static str>,
  exit_code: Option<i32>,
  process_description: Option<String>,
  action: RecoveryAction,
) {
  let diagnostic = ProcessFailureDiagnostic {
    event: "webview2.process_failed",
    failure_kind: failure_kind_name(kind),
    reason,
    exit_code,
    process_description,
    webview2_runtime_version: &state.runtime_version,
    gpu_adapters: &state.gpu_adapters,
    failure_report_folder: state.failure_report_folder.as_deref(),
    recovery_action: recovery_action_name(action),
  };
  match serde_json::to_string(&diagnostic) {
    Ok(diagnostic) => log::error!(target: "webview2_recovery", "{diagnostic}"),
    Err(error) => {
      log::error!(target: "webview2_recovery", "failed to serialize WebView2 process diagnostic: {error}")
    }
  }
}

fn log_browser_exit(
  state: &RecoveryState,
  exit_kind: webview2_com::Microsoft::Web::WebView2::Win32::COREWEBVIEW2_BROWSER_PROCESS_EXIT_KIND,
  browser_process_id: u32,
  action: RecoveryAction,
) {
  let diagnostic = BrowserExitDiagnostic {
    event: "webview2.browser_process_exited",
    exit_kind: if exit_kind == COREWEBVIEW2_BROWSER_PROCESS_EXIT_KIND_FAILED {
      "failed"
    } else {
      "normal"
    },
    browser_process_id,
    webview2_runtime_version: &state.runtime_version,
    gpu_adapters: &state.gpu_adapters,
    failure_report_folder: state.failure_report_folder.as_deref(),
    recovery_action: recovery_action_name(action),
  };
  match serde_json::to_string(&diagnostic) {
    Ok(diagnostic) => log::error!(target: "webview2_recovery", "{diagnostic}"),
    Err(error) => {
      log::error!(target: "webview2_recovery", "failed to serialize WebView2 browser diagnostic: {error}")
    }
  }
}

fn gpu_inventory() -> Vec<GpuAdapterDiagnostic> {
  let Ok(factory) = (unsafe { CreateDXGIFactory1::<IDXGIFactory1>() }) else {
    return Vec::new();
  };
  let mut adapters = Vec::new();

  for index in 0..16 {
    let Ok(adapter) = (unsafe { factory.EnumAdapters1(index) }) else {
      break;
    };
    if let Some(diagnostic) = gpu_adapter_diagnostic(&adapter) {
      adapters.push(diagnostic);
    }
  }
  adapters
}

fn gpu_adapter_diagnostic(adapter: &IDXGIAdapter1) -> Option<GpuAdapterDiagnostic> {
  let description = unsafe { adapter.GetDesc1() }.ok()?;
  let name_length = description
    .Description
    .iter()
    .position(|character| *character == 0)
    .unwrap_or(description.Description.len());
  let driver_version = unsafe { adapter.CheckInterfaceSupport(&ID3D11Device::IID) }
    .ok()
    .map(format_driver_version);

  Some(GpuAdapterDiagnostic {
    description: String::from_utf16_lossy(&description.Description[..name_length]),
    vendor_id: description.VendorId,
    device_id: description.DeviceId,
    subsystem_id: description.SubSysId,
    revision: description.Revision,
    driver_version,
  })
}

fn format_driver_version(version: i64) -> String {
  let version = version as u64;
  format!(
    "{}.{}.{}.{}",
    (version >> 48) & 0xffff,
    (version >> 32) & 0xffff,
    (version >> 16) & 0xffff,
    version & 0xffff
  )
}

fn show_crash_loop_message(failure_report_folder: Option<&str>) {
  let report_hint = failure_report_folder
    .map(|folder| format!("\n\nWebView2 failure reports: {folder}"))
    .unwrap_or_default();
  let message = format!(
    "Deadlock Mod Manager could not recover its WebView2 browser. The application will close to prevent a restart loop.{report_hint}"
  );
  let message = wide_string(&message);
  let title = wide_string("Deadlock Mod Manager - WebView2 recovery");
  unsafe {
    MessageBoxW(
      None,
      PCWSTR(message.as_ptr()),
      PCWSTR(title.as_ptr()),
      MB_OK | MB_ICONERROR,
    );
  }
}

fn wide_string(value: &str) -> Vec<u16> {
  value.encode_utf16().chain(std::iter::once(0)).collect()
}

fn unix_time_ms() -> u64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_default()
    .as_millis() as u64
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn renderer_failures_reload_twice_then_restart() {
    let mut policy = RecoveryPolicy::default();

    assert_eq!(
      policy.action(FailureKind::RenderProcessExited, 1_000),
      RecoveryAction::Reload
    );
    assert_eq!(
      policy.action(FailureKind::RenderProcessUnresponsive, 2_000),
      RecoveryAction::Reload
    );
    assert_eq!(
      policy.action(FailureKind::RenderProcessExited, 3_000),
      RecoveryAction::Restart
    );
  }

  #[test]
  fn renderer_retry_budget_resets_after_window() {
    let mut policy = RecoveryPolicy::default();
    assert_eq!(
      policy.action(FailureKind::RenderProcessExited, 1_000),
      RecoveryAction::Reload
    );
    assert_eq!(
      policy.action(FailureKind::RenderProcessExited, 2_000),
      RecoveryAction::Reload
    );

    assert_eq!(
      policy.action(
        FailureKind::RenderProcessExited,
        2_000 + RELOAD_WINDOW_MS + 1
      ),
      RecoveryAction::Reload
    );
  }

  #[test]
  fn failure_kinds_map_to_native_recovery_actions() {
    let mut policy = RecoveryPolicy::default();

    assert_eq!(
      policy.action(FailureKind::BrowserProcessExited, 0),
      RecoveryAction::AwaitBrowserExit
    );
    assert_eq!(
      policy.action(FailureKind::GpuProcessExited, 0),
      RecoveryAction::Observe
    );
    assert_eq!(
      policy.action(FailureKind::FrameRenderProcessExited, 0),
      RecoveryAction::Observe
    );
    assert_eq!(
      policy.action(FailureKind::UnknownProcessExited, 0),
      RecoveryAction::Observe
    );
  }

  #[test]
  fn driver_version_uses_windows_four_part_format() {
    let version = ((31_i64 << 48)) | (15_i64 << 16) | 4624;
    assert_eq!(format_driver_version(version), "31.0.15.4624");
  }

  #[test]
  fn known_non_renderer_failure_constants_are_observable() {
    for kind in [
      COREWEBVIEW2_PROCESS_FAILED_KIND_SANDBOX_HELPER_PROCESS_EXITED,
      COREWEBVIEW2_PROCESS_FAILED_KIND_UNKNOWN_PROCESS_EXITED,
      COREWEBVIEW2_PROCESS_FAILED_KIND_UTILITY_PROCESS_EXITED,
    ] {
      assert!(matches!(
        failure_kind(kind),
        FailureKind::SandboxHelperProcessExited
          | FailureKind::UnknownProcessExited
          | FailureKind::UtilityProcessExited
      ));
    }
  }
}
