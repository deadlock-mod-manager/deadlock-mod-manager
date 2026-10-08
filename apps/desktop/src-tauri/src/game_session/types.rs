use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// How a game session ended, judged from the signals left behind.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub enum SessionClassification {
  /// A new crash dump, or an exit code in the 0xC… range.
  Crash,
  /// Exit code 0, the console's clean-shutdown lines, or a Windows shutdown.
  Clean,
  /// The app stopped the game. How the session would have ended is unknown,
  /// so it is neither a crash nor proof that the setup works.
  Stopped,
  /// An abnormal exit with nothing that says why: exit code 1 (killed or a
  /// fatal error), or no clean-shutdown lines where we expected them.
  Ambiguous,
  /// No usable signal at all (no exit code, no dump, no console log).
  Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub enum ExitCodeSource {
  /// Our own handle on the process (Windows).
  ProcessHandle,
  /// Steam's `logs/gameprocess_log.txt`, matched by PID.
  SteamLog,
}

/// The crash dump Deadlock wrote for this session.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct DumpSummary {
  pub file: String,
  /// From the file name: `accessviolation`, `error`, `crash`, ...
  pub reason: Option<String>,
  /// `0xC0000005`
  pub exception_code: Option<String>,
  /// Engine uptime recorded in the dump.
  pub uptime_secs: Option<f64>,
  /// Source 2 addons from the dump's `Addons:` line. These are not the VPKs
  /// gameinfo.gi mounts, so zero does not mean mods weren't loaded.
  pub addon_count: Option<u32>,
}

/// The VPKs one `citadel/addons…` search path mounted at launch.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct AddonPathFingerprint {
  /// As written in gameinfo.gi, e.g. `citadel/addons/profile_default`.
  pub path: String,
  pub vpk_count: u32,
  /// Hash over each VPK's name, size and modification time.
  pub digest: String,
}

/// The performance config gameinfo.gi carried at launch.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct PerfConfigFingerprint {
  pub config_id: String,
  pub rev: String,
  pub name: Option<String>,
  pub applied_at: Option<String>,
  /// Settings the config wrote.
  pub setting_count: Option<u32>,
}

/// A mod enabled in the active profile at launch, as the frontend knows it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct ClientModRef {
  pub remote_id: String,
  pub name: String,
  pub downloaded_at: Option<String>,
  pub variant: Option<String>,
  pub enabled_at: Option<String>,
}

/// What only the frontend knows about a launch: the profile and its mods.
/// Whether the mods were mounted at all is in `addon_paths`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct ClientFingerprint {
  pub profile_id: String,
  pub profile_name: String,
  pub mods: Vec<ClientModRef>,
}

/// Everything about the setup a session ran with that a crash could come from.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct SessionFingerprint {
  /// `ClientVersion` from `game/citadel/steam.inf`.
  pub client_version: Option<u32>,
  /// Steam's build id from the app manifest.
  pub steam_build_id: Option<String>,
  /// The game's command line without the executable, `-steam`, join
  /// arguments (`+connect`, `+password`) and the flags the app adds to its
  /// own launches (`-condebug`, `-exec autoexec`).
  pub launch_args: Vec<String>,
  pub condebug: bool,
  pub autoexec_hash: Option<String>,
  pub addon_paths: Vec<AddonPathFingerprint>,
  pub perf_config: Option<PerfConfigFingerprint>,
  pub client: Option<ClientFingerprint>,
}

/// Sent as `game-session-ended` and kept until the frontend acknowledges it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct SessionReport {
  pub session_id: String,
  pub started_at: String,
  pub ended_at: Option<String>,
  /// The dump's uptime when there is one, else end minus process start.
  pub uptime_secs: Option<u32>,
  pub exit_code: Option<u32>,
  pub exit_code_source: Option<ExitCodeSource>,
  pub classification: SessionClassification,
  pub dump: Option<DumpSummary>,
  /// `Some` only when the game ran with `-condebug` and its log was ours.
  pub console_clean: Option<bool>,
  pub launched_by_dmm: bool,
  pub dmm_stopped: bool,
  /// The game build differs from the previous session the app saw.
  pub build_changed: bool,
  /// Analyzed at app start because the session ended while the app was closed.
  pub recovered: bool,
  pub fingerprint: SessionFingerprint,
}

/// Sent as `game-session-started` so the frontend can attach its fingerprint.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct SessionStartedEvent {
  pub session_id: String,
  pub launched_by_dmm: bool,
}

/// Why the frontend is done with a report. Only logged.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub enum SessionAckOutcome {
  /// Recorded as the last normal session.
  Normal,
  /// Nothing to show for it.
  Ignored,
  /// Shown, then closed without an answer.
  Dismissed,
  /// The user said they closed the game.
  ClosedByUser,
  /// The user undid a change or relaunched.
  ActedOn,
  /// A newer report replaced it.
  Superseded,
  /// Crash checks are turned off.
  Disabled,
}
