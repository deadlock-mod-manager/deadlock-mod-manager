//! Launch health: notices when Deadlock closes abnormally and records what the
//! setup looked like, so the frontend can ask "Did Deadlock just crash?" and
//! list what changed since the last normal session.
//!
//! A session starts when we see a Deadlock process: right after a launch from
//! the app, or when the frontend's running-game poll finds one. We capture a
//! fingerprint of the setup, persist the session, and wait for the process to
//! exit on a dedicated thread. At exit we gather the signals the research in
//! `classify` relies on (exit code, a new crash dump, console.log's shutdown
//! lines, whether the app stopped the game) and queue a [`SessionReport`] until
//! the frontend acknowledges it. A session that ended while the app was closed
//! is analyzed at the next start from the persisted record.
//!
//! Lock order: never take `MANAGER` while holding the tracker lock.

pub mod classify;
pub mod console;
pub mod dumps;
pub mod fingerprint;
pub mod steam_log;
pub mod store;
pub mod types;
mod waiter;

use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex, MutexGuard};
use std::time::Duration;

use chrono::{DateTime, Utc};
use tauri::Emitter;

use crate::app_runtime::AppHandle;
use crate::commands::state::MANAGER;
use crate::logs::crash_dumps::crash_dumps_dir_for;
use crate::mod_manager::game_process_manager::GameProcess;
use classify::{ExitSignals, classify};
use dumps::DumpSearch;
use store::{BuildStamp, SessionRecord, TrackerState};
use types::{
  ClientFingerprint, ExitCodeSource, SessionAckOutcome, SessionReport, SessionStartedEvent,
};

const SESSION_STARTED_EVENT: &str = "game-session-started";
const SESSION_ENDED_EVENT: &str = "game-session-ended";

/// A process that shows up this soon after a launch request is ours. Matches
/// how long the launch command waits for the game.
const LAUNCH_ATTRIBUTION_WINDOW: chrono::Duration = chrono::Duration::seconds(180);
const MAX_PENDING_REPORTS: usize = 10;
/// Breakpad can still be writing the dump when the process handle signals.
const DUMP_SETTLE: Duration = Duration::from_secs(3);
/// Steam logs the exit a few seconds after the process is gone.
const STEAM_LOG_ATTEMPTS: u32 = 3;
const STEAM_LOG_RETRY_DELAY: Duration = Duration::from_secs(3);
/// Without a PID (Flatpak) a session can only end through a dump or the
/// console's shutdown lines; give up on it eventually.
const PIDLESS_POLL_INTERVAL: Duration = Duration::from_secs(5);
const PIDLESS_MAX_AGE: chrono::Duration = chrono::Duration::hours(12);
const CONSOLE_LOG_SLACK: chrono::Duration = chrono::Duration::seconds(5);
/// Steam logs the launch of the session itself around its start (off Windows,
/// the wrapper's, just before it); nothing else can start that soon after.
const LATER_RUN_MIN_GAP: chrono::Duration = chrono::Duration::seconds(10);
/// The app's Stop can come before the session is tracked (it was still being
/// set up, or the running-game poll was paused), so an exit this soon after a
/// stop is the stop's doing.
const DMM_STOP_WINDOW: chrono::Duration = chrono::Duration::seconds(10);
/// Process start times come from different clocks and roundings: whole
/// seconds from the OS, a dump's MiscInfo, sysinfo's boot-time arithmetic.
const PROCESS_START_TOLERANCE_SECS: u64 = 2;

fn same_process_start(a: u64, b: u64) -> bool {
  a.abs_diff(b) <= PROCESS_START_TOLERANCE_SECS
}

/// The last `max_bytes` of a log file, which may be cut mid-line.
fn read_tail(path: &Path, max_bytes: u64) -> Option<String> {
  let mut file = std::fs::File::open(path).ok()?;
  let len = file.metadata().ok()?.len();
  file
    .seek(SeekFrom::Start(len.saturating_sub(max_bytes)))
    .ok()?;
  let mut bytes = Vec::new();
  file.read_to_end(&mut bytes).ok()?;
  Some(String::from_utf8_lossy(&bytes).into_owned())
}

struct LaunchRequest {
  at: DateTime<Utc>,
  args: String,
}

struct Tracker {
  app_data_dir: Option<PathBuf>,
  sessions_dir: Option<PathBuf>,
  app_handle: Option<AppHandle>,
  enabled: bool,
  /// A session is being set up on another thread.
  starting: bool,
  current: Option<SessionRecord>,
  pending: Vec<SessionReport>,
  launch_request: Option<LaunchRequest>,
  /// The app's last Stop, whether or not a session was tracked then.
  dmm_stop_at: Option<DateTime<Utc>>,
  state: TrackerState,
}

static TRACKER: LazyLock<Mutex<Tracker>> = LazyLock::new(|| {
  Mutex::new(Tracker {
    app_data_dir: None,
    sessions_dir: None,
    app_handle: None,
    enabled: true,
    starting: false,
    current: None,
    pending: Vec::new(),
    launch_request: None,
    dmm_stop_at: None,
    state: TrackerState::default(),
  })
});

/// Nothing panics while the lock is held, so a poisoned lock is recovered
/// rather than disabling crash checks for the rest of the run.
fn tracker() -> MutexGuard<'static, Tracker> {
  TRACKER
    .lock()
    .unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[derive(Debug, Clone, Copy, Default)]
struct ObservedExit {
  exit_code: Option<u32>,
  ended_at: Option<DateTime<Utc>>,
}

/// Loads persisted sessions and analyzes one that ended while the app was
/// closed. Does nothing in the E2E harness, which never runs the game.
pub fn init(app_handle: AppHandle, app_data_dir: PathBuf) {
  if crate::runtime_environment::records_game_launches() {
    return;
  }
  let sessions_dir = store::sessions_dir(&app_data_dir);
  let current = store::load_current(&sessions_dir);
  {
    let mut tracker = tracker();
    tracker.pending = store::load_pending(&sessions_dir);
    tracker.state = store::load_state(&sessions_dir);
    tracker.current = current.clone();
    tracker.sessions_dir = Some(sessions_dir);
    tracker.app_data_dir = Some(app_data_dir);
    tracker.app_handle = Some(app_handle);
  }
  if let Some(record) = current {
    spawn("game-session-recovery", move || recover(record));
  }
}

/// Called before the app asks Steam to start the game.
pub fn note_launch_requested(args: &str) {
  let mut tracker = tracker();
  let Some(sessions_dir) = tracker.sessions_dir.clone() else {
    return;
  };
  tracker.launch_request = Some(LaunchRequest {
    at: Utc::now(),
    args: args.to_string(),
  });
  // A Flatpak session that never showed how it ended is over now, and the
  // new launch truncates the console.log it was waiting on.
  if tracker
    .current
    .as_ref()
    .is_some_and(|current| current.pid.is_none())
  {
    tracker.current = None;
    store::save_current(&sessions_dir, None);
  }
}

/// Called once the launch command saw the game start.
pub fn on_launch_confirmed() {
  if tracker().sessions_dir.is_none() {
    return;
  }
  spawn("game-session-start", || {
    let processes = running_game_processes();
    if !processes.is_empty() {
      observe(&processes);
    } else if crate::flatpak::running_in_flatpak() && claim_session_start() {
      start_session(None);
    }
  });
}

/// Called with every process scan the app does anyway (the frontend polls
/// `is_game_running`), so sessions started outside the app are tracked too.
pub fn observe(processes: &[GameProcess]) {
  let Some(process) = processes
    .iter()
    .min_by_key(|process| (process.start_time, process.pid))
  else {
    return;
  };
  if !claim_session_start() {
    return;
  }
  let process = process.clone();
  spawn("game-session-start", move || start_session(Some(process)));
}

/// Marks the running session as stopped by the app, so the forced kill
/// (exit code 1) isn't taken for a crash. Called before the kill.
pub fn note_dmm_stop() {
  let mut tracker = tracker();
  let Some(sessions_dir) = tracker.sessions_dir.clone() else {
    return;
  };
  tracker.dmm_stop_at = Some(Utc::now());
  if let Some(current) = tracker.current.as_mut() {
    current.dmm_stop_requested = true;
    store::save_current(&sessions_dir, Some(&*current));
  }
}

pub fn pending_reports() -> Vec<SessionReport> {
  let mut reports = tracker().pending.clone();
  reports.sort_by(|a, b| a.started_at.cmp(&b.started_at));
  reports
}

pub fn acknowledge(session_id: &str, outcome: SessionAckOutcome) {
  let mut tracker = tracker();
  let Some(sessions_dir) = tracker.sessions_dir.clone() else {
    return;
  };
  let before = tracker.pending.len();
  tracker
    .pending
    .retain(|report| report.session_id != session_id);
  if tracker.pending.len() != before {
    store::save_pending(&sessions_dir, &tracker.pending);
    log::info!("Game session {session_id} acknowledged: {outcome:?}");
  }
}

/// Attaches the frontend's half of the fingerprint. The first one wins, so a
/// restarted app doesn't overwrite what the launch looked like. Without an id
/// it goes to the running session.
pub fn record_client_fingerprint(session_id: Option<&str>, client: ClientFingerprint) -> bool {
  let mut tracker = tracker();
  let Some(sessions_dir) = tracker.sessions_dir.clone() else {
    return false;
  };
  let Some(current) = tracker.current.as_mut().filter(|current| {
    session_id.is_none_or(|session_id| session_id == current.session_id)
      && current.fingerprint.client.is_none()
  }) else {
    return false;
  };
  current.fingerprint.client = Some(client);
  store::save_current(&sessions_dir, Some(&*current));
  true
}

pub fn set_enabled(enabled: bool) {
  let mut tracker = tracker();
  tracker.enabled = enabled;
  if !enabled
    && !tracker.pending.is_empty()
    && let Some(sessions_dir) = tracker.sessions_dir.clone()
  {
    tracker.pending.clear();
    store::save_pending(&sessions_dir, &[]);
  }
}

fn claim_session_start() -> bool {
  let mut tracker = tracker();
  if tracker.sessions_dir.is_none()
    || !tracker.enabled
    || tracker.starting
    || tracker.current.is_some()
  {
    return false;
  }
  tracker.starting = true;
  true
}

fn running_game_processes() -> Vec<GameProcess> {
  MANAGER
    .lock()
    .ok()
    .and_then(|mut manager| manager.game_processes().ok())
    .unwrap_or_default()
}

fn start_session(process: Option<GameProcess>) {
  let record = build_record(process);
  let mut tracker = tracker();
  tracker.starting = false;
  let (Some(mut record), Some(sessions_dir)) = (record, tracker.sessions_dir.clone()) else {
    return;
  };
  if tracker.current.is_some() {
    return;
  }

  let build = BuildStamp {
    client_version: record.fingerprint.client_version,
    steam_build_id: record.fingerprint.steam_build_id.clone(),
  };
  record.build_changed = tracker
    .state
    .last_build
    .as_ref()
    .is_some_and(|last| *last != build);
  tracker.state.last_build = Some(build);
  store::save_state(&sessions_dir, &tracker.state);
  store::save_current(&sessions_dir, Some(&record));
  tracker.current = Some(record.clone());
  let app_handle = tracker.app_handle.clone();
  drop(tracker);

  log::info!(
    "Tracking Deadlock session {} (pid {:?}, launched by app: {})",
    record.session_id,
    record.pid,
    record.launched_by_dmm
  );
  emit(
    app_handle.as_ref(),
    SESSION_STARTED_EVENT,
    SessionStartedEvent {
      session_id: record.session_id.clone(),
      launched_by_dmm: record.launched_by_dmm,
    },
  );
  watch(record);
}

fn build_record(process: Option<GameProcess>) -> Option<SessionRecord> {
  let (game_path, steam_path) = {
    let manager = MANAGER.lock().ok()?;
    let steam_manager = manager.get_steam_manager();
    (
      steam_manager.get_game_path().cloned()?,
      steam_manager.get_steam_path(),
    )
  };
  let (app_data_dir, launch) = {
    let mut tracker = tracker();
    (tracker.app_data_dir.clone()?, tracker.launch_request.take())
  };

  let now = Utc::now();
  let launch = launch.filter(|launch| now - launch.at <= LAUNCH_ATTRIBUTION_WINDOW);
  let started_at = process
    .as_ref()
    .and_then(|process| process_started_at(process.start_time))
    .unwrap_or(now);

  let mut arguments: Vec<String> = match &process {
    Some(process) if process.command.len() > 1 => process.command[1..].to_vec(),
    _ => launch
      .as_ref()
      .map(|launch| launch.args.split_whitespace().map(str::to_string).collect())
      .unwrap_or_default(),
  };
  // The Flatpak launch path always adds -condebug (see SteamManager).
  if process.is_none()
    && crate::flatpak::running_in_flatpak()
    && !arguments.iter().any(|argument| argument == "-condebug")
  {
    arguments.push("-condebug".to_string());
  }

  let pid = process.as_ref().map(|process| process.pid);
  Some(SessionRecord {
    session_id: format!("{}-{}", started_at.timestamp_millis(), pid.unwrap_or(0)),
    pid,
    process_start: process.as_ref().map(|process| process.start_time),
    started_at,
    launched_by_dmm: launch.is_some(),
    dmm_stop_requested: false,
    build_changed: false,
    fingerprint: fingerprint::capture(&game_path, &app_data_dir, &arguments),
    game_path,
    steam_path,
  })
}

/// `None` when the OS couldn't tell.
fn process_started_at(start_time: u64) -> Option<DateTime<Utc>> {
  DateTime::from_timestamp(i64::try_from(start_time).ok()?, 0)
    .filter(|started_at| *started_at > DateTime::UNIX_EPOCH)
}

fn watch(record: SessionRecord) {
  spawn("game-session-watch", move || {
    let exit_code = match record.pid {
      Some(pid) => waiter::wait_for_exit(pid, record.process_start),
      None if wait_for_pidless_end(&record) => None,
      None => {
        discard(&record.session_id);
        return;
      }
    };
    let exit = ObservedExit {
      exit_code,
      ended_at: Some(Utc::now()),
    };
    finalize(record, exit, false, None);
  });
}

#[derive(Debug, PartialEq, Eq)]
enum Recovery {
  /// The game is still running: watch it again.
  Resume,
  /// It ended while the app was closed: analyze what it left behind.
  /// `later_run` is when the game running now started: that run owns
  /// console.log, and its dumps are not ours.
  Analyze {
    later_run: Option<DateTime<Utc>>,
  },
  Discard,
}

fn plan_recovery(record: &SessionRecord, running: &[GameProcess], now: DateTime<Utc>) -> Recovery {
  let Some(pid) = record.pid else {
    return if now - record.started_at > PIDLESS_MAX_AGE {
      Recovery::Discard
    } else {
      Recovery::Resume
    };
  };
  // PIDs are reused, so the start time has to match too.
  let still_running = running.iter().any(|process| {
    process.pid == pid
      && record
        .process_start
        .is_none_or(|start| same_process_start(process.start_time, start))
  });
  if still_running {
    Recovery::Resume
  } else {
    Recovery::Analyze {
      later_run: running
        .iter()
        .map(|process| process_started_at(process.start_time).unwrap_or(now))
        .min(),
    }
  }
}

fn recover(record: SessionRecord) {
  match plan_recovery(&record, &running_game_processes(), Utc::now()) {
    Recovery::Resume => {
      log::info!(
        "Deadlock session {} is still running; watching it again",
        record.session_id
      );
      watch(record);
    }
    Recovery::Analyze { later_run } => finalize(record, ObservedExit::default(), true, later_run),
    Recovery::Discard => discard(&record.session_id),
  }
}

fn wait_for_pidless_end(record: &SessionRecord) -> bool {
  let dumps_dir = crash_dumps_dir_for(&record.game_path);
  let console_log = console::console_log_path(&record.game_path);
  let search = DumpSearch {
    pid: None,
    process_start: None,
    started_at: record.started_at,
    ended_at: None,
    next_start: None,
  };
  loop {
    if !is_current(&record.session_id) || Utc::now() - record.started_at > PIDLESS_MAX_AGE {
      return false;
    }
    if dumps::find_session_dump(&dumps_dir, &search).is_some()
      || console::ended_cleanly(&console_log) == Some(true)
    {
      return true;
    }
    std::thread::sleep(PIDLESS_POLL_INTERVAL);
  }
}

fn finalize(
  record: SessionRecord,
  observed: ObservedExit,
  recovered: bool,
  later_run: Option<DateTime<Utc>>,
) {
  if !recovered {
    std::thread::sleep(DUMP_SETTLE);
  }
  // The app may have stopped the game, or the frontend attached its
  // fingerprint, while we were waiting.
  let (record, dmm_stop_at) = {
    let tracker = tracker();
    let record = tracker
      .current
      .clone()
      .filter(|current| current.session_id == record.session_id)
      .unwrap_or(record);
    (record, tracker.dmm_stop_at)
  };
  let dmm_stop_requested = record.dmm_stop_requested
    || dmm_stop_at
      .is_some_and(|stop_at| stop_ended_session(stop_at, record.started_at, observed.ended_at));
  let record = SessionRecord {
    dmm_stop_requested,
    ..record
  };
  let report = analyze(record, observed, recovered, later_run);
  log::info!(
    "Deadlock session {} ended: {:?} (exit code {:?} from {:?}, dump {:?}, console clean {:?}, uptime {:?}s)",
    report.session_id,
    report.classification,
    report.exit_code,
    report.exit_code_source,
    report.dump.as_ref().map(|dump| &dump.file),
    report.console_clean,
    report.uptime_secs
  );

  let mut tracker = tracker();
  let Some(sessions_dir) = tracker.sessions_dir.clone() else {
    return;
  };
  if tracker
    .current
    .as_ref()
    .is_some_and(|current| current.session_id == report.session_id)
  {
    tracker.current = None;
    store::save_current(&sessions_dir, None);
  }
  if !tracker.enabled {
    return;
  }
  tracker
    .pending
    .retain(|pending| pending.session_id != report.session_id);
  tracker.pending.push(report.clone());
  let overflow = tracker.pending.len().saturating_sub(MAX_PENDING_REPORTS);
  tracker.pending.drain(..overflow);
  store::save_pending(&sessions_dir, &tracker.pending);
  let app_handle = tracker.app_handle.clone();
  drop(tracker);
  emit(app_handle.as_ref(), SESSION_ENDED_EVENT, report);
}

/// Whether the app's Stop at `stop_at` is what ended a session that started
/// at `started_at` and was seen to end at `ended_at`.
fn stop_ended_session(
  stop_at: DateTime<Utc>,
  started_at: DateTime<Utc>,
  ended_at: Option<DateTime<Utc>>,
) -> bool {
  stop_at >= started_at
    && ended_at.is_some_and(|ended_at| ended_at >= stop_at && ended_at - stop_at <= DMM_STOP_WINDOW)
}

/// Gathers the exit signals and classifies the session. `later_run` is when
/// a run that started after this one was seen to start, if any.
fn analyze(
  record: SessionRecord,
  observed: ObservedExit,
  recovered: bool,
  later_run: Option<DateTime<Utc>>,
) -> SessionReport {
  let mut exit_code = observed.exit_code;
  let mut exit_code_source = exit_code.map(|_| ExitCodeSource::ProcessHandle);
  let mut ended_at = observed.ended_at;
  let mut later_run_seen = later_run.is_some();
  let mut next_start = later_run.filter(|start| *start > record.started_at);
  if let Some(steam_path) = &record.steam_path
    && (exit_code.is_none() || recovered)
  {
    // Only Windows PIDs match what Steam logs, so only there is it worth waiting.
    let attempts = if cfg!(windows) && record.pid.is_some() && !recovered {
      STEAM_LOG_ATTEMPTS
    } else {
      1
    };
    let mut events = Vec::new();
    for attempt in 1..=attempts {
      events = steam_log::read_tail(steam_path)
        .map(|text| steam_log::parse_events(&text))
        .unwrap_or_default();
      let exit = record
        .pid
        .and_then(|pid| steam_log::find_exit(&events, pid, record.started_at));
      if let Some((code, at)) = exit {
        if exit_code.is_none() {
          exit_code = Some(code);
          exit_code_source = Some(ExitCodeSource::SteamLog);
        }
        ended_at = ended_at.or(Some(at));
        break;
      }
      if attempt < attempts {
        std::thread::sleep(STEAM_LOG_RETRY_DELAY);
      }
    }
    if let Some(start) =
      steam_log::next_start(&events, record.started_at + LATER_RUN_MIN_GAP, record.pid)
    {
      later_run_seen = true;
      next_start = Some(next_start.map_or(start, |known| known.min(start)));
    }
  }

  let console_log = console::console_log_path(&record.game_path);
  let console_modified = std::fs::metadata(&console_log)
    .and_then(|metadata| metadata.modified())
    .ok()
    .map(DateTime::<Utc>::from)
    .filter(|modified| *modified >= record.started_at - CONSOLE_LOG_SLACK);
  let console_is_ours =
    record.fingerprint.condebug && !later_run_seen && console_modified.is_some();
  let console_clean = console_is_ours
    .then(|| console::ended_cleanly(&console_log))
    .flatten();
  if console_is_ours {
    ended_at = ended_at.or(console_modified);
  }

  let dump = dumps::find_session_dump(
    &crash_dumps_dir_for(&record.game_path),
    &DumpSearch {
      pid: record.pid,
      process_start: record.process_start,
      started_at: record.started_at,
      ended_at,
      next_start,
    },
  );

  let classification = classify(&ExitSignals {
    exit_code,
    dump_found: dump.is_some(),
    console_clean,
    dmm_stopped: record.dmm_stop_requested,
  });
  let uptime_secs = dump
    .as_ref()
    .and_then(|dump| dump.uptime_secs)
    .map(|uptime| uptime.round() as u32)
    .or_else(|| {
      ended_at.map(|ended_at| {
        u32::try_from((ended_at - record.started_at).num_seconds().max(0)).unwrap_or(u32::MAX)
      })
    });

  SessionReport {
    session_id: record.session_id,
    started_at: record.started_at.to_rfc3339(),
    ended_at: ended_at.map(|ended_at| ended_at.to_rfc3339()),
    uptime_secs,
    exit_code,
    exit_code_source,
    classification,
    dump,
    console_clean,
    launched_by_dmm: record.launched_by_dmm,
    dmm_stopped: record.dmm_stop_requested,
    build_changed: record.build_changed,
    recovered,
    fingerprint: record.fingerprint,
  }
}

fn is_current(session_id: &str) -> bool {
  tracker()
    .current
    .as_ref()
    .is_some_and(|current| current.session_id == session_id)
}

fn discard(session_id: &str) {
  let mut tracker = tracker();
  if let Some(sessions_dir) = tracker.sessions_dir.clone()
    && tracker
      .current
      .as_ref()
      .is_some_and(|current| current.session_id == session_id)
  {
    tracker.current = None;
    store::save_current(&sessions_dir, None);
  }
}

fn emit(app_handle: Option<&AppHandle>, event: &str, payload: impl serde::Serialize + Clone) {
  if let Some(app_handle) = app_handle
    && let Err(error) = app_handle.emit(event, payload)
  {
    log::warn!("Could not emit {event}: {error}");
  }
}

fn spawn(name: &str, task: impl FnOnce() + Send + 'static) {
  if let Err(error) = std::thread::Builder::new()
    .name(name.to_string())
    .spawn(task)
  {
    log::error!("Could not start {name} thread: {error}");
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::game_session::dumps::tests::synthetic_dump;
  use crate::game_session::store::tests::record;
  use crate::game_session::types::SessionClassification;

  fn process(pid: u32, start_time: u64) -> GameProcess {
    GameProcess {
      pid,
      start_time,
      command: vec!["deadlock.exe".to_string()],
    }
  }

  #[test]
  fn resumes_a_session_whose_process_is_still_running() {
    let record = record(Some(4242));

    assert_eq!(
      plan_recovery(&record, &[process(4242, 1_760_000_001)], Utc::now()),
      Recovery::Resume
    );
  }

  #[test]
  fn a_reused_pid_is_not_the_same_session() {
    let record = record(Some(4242));

    assert_eq!(
      plan_recovery(&record, &[process(4242, 1_760_009_999)], Utc::now()),
      Recovery::Analyze {
        later_run: DateTime::from_timestamp(1_760_009_999, 0)
      }
    );
    assert_eq!(
      plan_recovery(&record, &[], Utc::now()),
      Recovery::Analyze { later_run: None }
    );
  }

  #[test]
  fn old_sessions_without_a_pid_are_dropped() {
    let record = record(None);
    let soon = record.started_at + chrono::Duration::minutes(30);
    let much_later = record.started_at + chrono::Duration::days(2);

    assert_eq!(plan_recovery(&record, &[], soon), Recovery::Resume);
    assert_eq!(plan_recovery(&record, &[], much_later), Recovery::Discard);
  }

  fn game_dir() -> tempfile::TempDir {
    let game = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(game.path().join("game").join("bin").join("win64")).unwrap();
    std::fs::create_dir_all(game.path().join("game").join("citadel")).unwrap();
    game
  }

  fn recovered_record(game: &tempfile::TempDir) -> SessionRecord {
    SessionRecord {
      started_at: Utc::now() - chrono::Duration::seconds(60),
      process_start: None,
      game_path: game.path().to_path_buf(),
      ..record(Some(4242))
    }
  }

  #[test]
  fn a_session_that_crashed_while_the_app_was_closed_is_found_at_startup() {
    let game = game_dir();
    std::fs::write(
      game
        .path()
        .join("game/bin/win64/deadlock_2026_1008_120041_0_accessviolation.mdmp"),
      synthetic_dump(4242, None, "Crash\nUptime( 41.4 )\nAddons: \n"),
    )
    .unwrap();
    std::fs::write(
      console::console_log_path(game.path()),
      "Source2Init OK\n[Client] loading\n",
    )
    .unwrap();

    let report = analyze(recovered_record(&game), ObservedExit::default(), true, None);

    assert_eq!(report.classification, SessionClassification::Crash);
    assert_eq!(report.uptime_secs, Some(41));
    assert_eq!(report.console_clean, Some(false));
    assert!(report.recovered);
    assert_eq!(
      report.dump.map(|dump| dump.reason),
      Some(Some("accessviolation".to_string()))
    );
  }

  #[test]
  fn a_clean_quit_while_the_app_was_closed_reads_as_clean() {
    let game = game_dir();
    std::fs::write(
      console::console_log_path(game.path()),
      "Source2Init OK\nSource2Shutdown\nShutdownSource2Logging\n",
    )
    .unwrap();

    let report = analyze(recovered_record(&game), ObservedExit::default(), true, None);

    assert_eq!(report.classification, SessionClassification::Clean);
    assert_eq!(report.console_clean, Some(true));
    assert!(report.ended_at.is_some());
  }

  #[test]
  fn a_later_run_owns_the_console_log() {
    let game = game_dir();
    std::fs::write(console::console_log_path(game.path()), "still running\n").unwrap();
    let later_run = Utc::now() - chrono::Duration::seconds(10);

    let report = analyze(
      recovered_record(&game),
      ObservedExit::default(),
      true,
      Some(later_run),
    );

    assert_eq!(report.console_clean, None);
    assert_eq!(report.classification, SessionClassification::Unknown);
  }

  fn steam_time(at: DateTime<Utc>) -> String {
    at.with_timezone(&chrono::Local)
      .format("%Y-%m-%d %H:%M:%S")
      .to_string()
  }

  #[test]
  fn steams_log_shows_a_later_run_and_its_dump_is_not_ours() {
    let game = game_dir();
    let steam = tempfile::tempdir().unwrap();
    let record = SessionRecord {
      steam_path: Some(steam.path().to_path_buf()),
      ..recovered_record(&game)
    };
    // No exit line for our PID, as off Windows, where Steam tracks Proton's
    // wrapper; a later launch of the game is still logged.
    let later_run = record.started_at + chrono::Duration::seconds(30);
    std::fs::create_dir_all(steam.path().join("logs")).unwrap();
    std::fs::write(
      steam.path().join("logs").join("gameprocess_log.txt"),
      format!(
        "[{}] AppID 1422450 adding PID 5555 as a tracked process \"deadlock.exe -steam\"\n",
        steam_time(later_run)
      ),
    )
    .unwrap();
    std::fs::write(console::console_log_path(game.path()), "still running\n").unwrap();
    std::fs::write(
      game
        .path()
        .join("game/bin/win64/deadlock_2026_1008_120041_0_crash.mdmp"),
      synthetic_dump(4242, None, "Crash\n"),
    )
    .unwrap();

    let report = analyze(record, ObservedExit::default(), true, None);

    assert_eq!(report.console_clean, None);
    assert_eq!(report.dump, None);
    assert_eq!(report.classification, SessionClassification::Unknown);
  }

  #[test]
  fn the_apps_own_stop_is_not_judged() {
    let game = game_dir();
    let record = SessionRecord {
      dmm_stop_requested: true,
      ..recovered_record(&game)
    };

    let report = analyze(
      record,
      ObservedExit {
        exit_code: Some(1),
        ended_at: Some(Utc::now()),
      },
      false,
      None,
    );

    assert_eq!(report.classification, SessionClassification::Stopped);
    assert_eq!(report.exit_code_source, Some(ExitCodeSource::ProcessHandle));
    assert_eq!(report.uptime_secs, Some(60));
    assert!(report.dmm_stopped);
  }

  #[test]
  fn an_exit_right_after_the_apps_stop_is_the_stops_doing() {
    let started_at = Utc::now() - chrono::Duration::seconds(60);
    let stop_at = started_at + chrono::Duration::seconds(30);
    let after = |seconds| Some(stop_at + chrono::Duration::seconds(seconds));

    assert!(stop_ended_session(stop_at, started_at, after(2)));
    assert!(!stop_ended_session(stop_at, started_at, after(60)));
    assert!(!stop_ended_session(stop_at, started_at, after(-5)));
    assert!(!stop_ended_session(stop_at, started_at, None));
    // A stop from before this session started was for an earlier one.
    assert!(!stop_ended_session(
      started_at - chrono::Duration::seconds(5),
      started_at,
      Some(started_at + chrono::Duration::seconds(1))
    ));
  }
}
