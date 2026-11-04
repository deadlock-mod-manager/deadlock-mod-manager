//! Runs each plugin backend in its own worker process and brokers its
//! hostcalls. A worker that crashes, hangs or breaks the protocol is killed
//! and restarted on the next call; repeated crashes quarantine the plugin.

use super::protocol::{self, FromWorker, ToWorker};
use super::registry::{ActivePlugin, SessionDenied};
use super::{PluginHost, abi, host_api, lock, package, worker};
use chrono::{DateTime, Local};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::ffi::OsString;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(10);
const LOAD_TIMEOUT: Duration = Duration::from_secs(60);
/// Wall-clock budget for guest execution in one call. Time the host spends
/// serving hostcalls (hashing, deploying) does not count.
const GUEST_TIMEOUT: Duration = Duration::from_secs(20);
const CRASH_WINDOW: Duration = Duration::from_secs(600);
const CRASHES_BEFORE_QUARANTINE: usize = 3;
const MAX_STDERR_LINES: usize = 200;

#[derive(Debug, Clone)]
pub struct WorkerLauncher {
  pub program: PathBuf,
  pub args: Vec<OsString>,
  pub env: Vec<(OsString, OsString)>,
  pub cwd: PathBuf,
}

impl WorkerLauncher {
  /// The worker is this same executable started with [`worker::WORKER_ARG`].
  pub fn current_exe(cwd: PathBuf) -> std::io::Result<Self> {
    Ok(Self {
      program: std::env::current_exe()?,
      args: vec![worker::WORKER_ARG.into()],
      env: Vec::new(),
      cwd,
    })
  }

  fn command(&self) -> Command {
    let mut command = Command::new(&self.program);
    command
      .args(&self.args)
      .env_clear()
      .current_dir(&self.cwd)
      .stdin(Stdio::piped())
      .stdout(Stdio::piped())
      .stderr(Stdio::piped());
    // Without SystemRoot some Windows system DLLs fail to initialise. Nothing
    // else from the app's environment (tokens, API URLs, proxies) is passed.
    #[cfg(windows)]
    {
      use std::os::windows::process::CommandExt;
      const CREATE_NO_WINDOW: u32 = 0x0800_0000;
      if let Some(root) = std::env::var_os("SystemRoot") {
        command.env("SystemRoot", root);
      }
      command.creation_flags(CREATE_NO_WINDOW);
    }
    command.envs(self.env.iter().map(|(key, value)| (key, value)));
    command
  }
}

enum Frame {
  Ready,
  Data(Vec<u8>),
  Closed(String),
}

struct Process {
  child: Arc<Mutex<Option<Child>>>,
  stdin: ChildStdin,
  frames: Receiver<Frame>,
}

#[derive(Default)]
struct Slot {
  generation: u64,
  process: Option<Process>,
  next_call: u64,
}

pub enum CallOutcome {
  Envelope {
    output: String,
    host_failure: Option<String>,
  },
  Busy,
  Denied(SessionDenied),
}

pub struct Supervisor {
  launcher: WorkerLauncher,
  slots: Mutex<HashMap<String, Arc<Mutex<Slot>>>>,
  children: Mutex<HashMap<String, Arc<Mutex<Option<Child>>>>>,
  crashes: Mutex<HashMap<String, Vec<Instant>>>,
  /// Local times of worker failures, for the summary's daily count. Unlike
  /// `crashes`, re-enabling a plugin does not clear these.
  restarts: Mutex<HashMap<String, Vec<DateTime<Local>>>>,
}

impl Drop for Supervisor {
  fn drop(&mut self) {
    let children = self
      .children
      .get_mut()
      .unwrap_or_else(|poison| poison.into_inner());
    for child in children.values() {
      kill(child);
    }
  }
}

enum Failure {
  Crash(String),
  Denied(SessionDenied),
}

fn kill(child: &Mutex<Option<Child>>) {
  if let Ok(mut child) = child.lock()
    && let Some(mut child) = child.take()
  {
    let _ = child.kill();
    let _ = child.wait();
  }
}

impl Supervisor {
  pub fn new(launcher: WorkerLauncher) -> Self {
    Self {
      launcher,
      slots: Mutex::new(HashMap::new()),
      children: Mutex::new(HashMap::new()),
      crashes: Mutex::new(HashMap::new()),
      restarts: Mutex::new(HashMap::new()),
    }
  }

  fn slot(&self, id: &str) -> Arc<Mutex<Slot>> {
    let mut slots = lock(&self.slots);
    Arc::clone(slots.entry(id.to_owned()).or_default())
  }

  /// Kills the plugin's worker, even mid-call. The interrupted call then
  /// fails its session check instead of reporting a crash.
  pub fn terminate(&self, id: &str) {
    let child = lock(&self.children).remove(id);
    if let Some(child) = child {
      kill(&child);
    }
  }

  /// Kills the worker process behind the supervisor's back, as a crash would.
  #[cfg(test)]
  pub fn kill_process_for_test(&self, id: &str) {
    let children = self.children.lock().unwrap();
    if let Some(child) = children.get(id)
      && let Some(child) = child.lock().unwrap().as_mut()
    {
      child.kill().unwrap();
      child.wait().unwrap();
    }
  }

  pub fn forget_crashes(&self, id: &str) {
    lock(&self.crashes).remove(id);
  }

  pub fn forget(&self, id: &str) {
    self.forget_crashes(id);
    lock(&self.restarts).remove(id);
  }

  /// Worker failures since local midnight.
  pub fn restarts_today(&self, id: &str) -> u32 {
    let today = Local::now().date_naive();
    lock(&self.restarts).get(id).map_or(0, |history| {
      history.iter().filter(|at| at.date_naive() == today).count() as u32
    })
  }

  /// Runs `f` once no call of the plugin is in progress, holding new calls
  /// back until it returns.
  pub fn exclusive<T>(&self, id: &str, f: impl FnOnce() -> T) -> T {
    let slot = self.slot(id);
    let _slot = lock(&slot);
    f()
  }

  #[cfg(test)]
  pub fn is_running(&self, id: &str) -> bool {
    lock(&self.children)
      .get(id)
      .is_some_and(|child| child.lock().is_ok_and(|child| child.is_some()))
  }

  fn record_crash(&self, id: &str) -> bool {
    let mut crashes = lock(&self.crashes);
    let history = crashes.entry(id.to_owned()).or_default();
    history.retain(|at| at.elapsed() < CRASH_WINDOW);
    history.push(Instant::now());
    let quarantine = history.len() >= CRASHES_BEFORE_QUARANTINE;
    drop(crashes);
    let now = Local::now();
    let mut restarts = lock(&self.restarts);
    let history = restarts.entry(id.to_owned()).or_default();
    history.retain(|at| at.date_naive() == now.date_naive());
    history.push(now);
    quarantine
  }

  fn spawn(&self, plugin: &ActivePlugin) -> Result<Process, String> {
    let backend = plugin
      .manifest
      .backend
      .as_deref()
      .and_then(|backend| package::package_file(&plugin.package_dir, backend))
      .ok_or("Plugin has no backend")?;
    let bytes = std::fs::read(&backend).map_err(|error| format!("Cannot read backend: {error}"))?;
    if plugin.backend_hash.as_deref() != Some(&format!("{:x}", Sha256::digest(&bytes))) {
      return Err("Installed backend no longer matches its package; reinstall the plugin".into());
    }
    let mut child = self
      .launcher
      .command()
      .spawn()
      .map_err(|error| format!("Cannot start plugin worker: {error}"))?;
    let (Some(stdin), Some(stdout), Some(stderr)) =
      (child.stdin.take(), child.stdout.take(), child.stderr.take())
    else {
      let _ = child.kill();
      return Err("Plugin worker has no pipes".into());
    };

    let (sender, frames) = mpsc::channel();
    std::thread::Builder::new()
      .name(format!("plugin-worker-out-{}", plugin.id))
      .spawn(move || {
        let mut stdout = BufReader::new(stdout);
        if let Err(error) = protocol::expect_magic(&mut stdout) {
          let _ = sender.send(Frame::Closed(error.to_string()));
          return;
        }
        if sender.send(Frame::Ready).is_err() {
          return;
        }
        loop {
          let frame = match protocol::read_frame(&mut stdout, protocol::MAX_MESSAGE_FRAME_BYTES) {
            Ok(Some(bytes)) => Frame::Data(bytes),
            Ok(None) => Frame::Closed("worker exited".into()),
            Err(error) => Frame::Closed(error.to_string()),
          };
          let closed = matches!(frame, Frame::Closed(_));
          if sender.send(frame).is_err() || closed {
            return;
          }
        }
      })
      .map_err(|error| error.to_string())?;
    let label = plugin.id.clone();
    let _ = std::thread::Builder::new()
      .name(format!("plugin-worker-err-{}", plugin.id))
      .spawn(move || {
        for line in BufReader::new(stderr)
          .lines()
          .map_while(Result::ok)
          .take(MAX_STDERR_LINES)
        {
          log::warn!(
            "[ExternalPlugins] {label} worker: {}",
            line.chars().take(512).collect::<String>()
          );
        }
      });

    let child = Arc::new(Mutex::new(Some(child)));
    lock(&self.children).insert(plugin.id.clone(), Arc::clone(&child));
    let mut process = Process {
      child,
      stdin,
      frames,
    };
    let loaded = (|| {
      match process.frames.recv_timeout(HANDSHAKE_TIMEOUT) {
        Ok(Frame::Ready) => {}
        Ok(Frame::Closed(reason)) => {
          return Err(format!("Plugin worker failed to start: {reason}"));
        }
        _ => return Err("Plugin worker did not start in time".into()),
      }
      protocol::write_frame(&mut process.stdin, &bytes).map_err(|error| error.to_string())?;
      match process.frames.recv_timeout(LOAD_TIMEOUT) {
        Ok(Frame::Data(frame)) => match serde_json::from_slice(&frame) {
          Ok(FromWorker::Loaded) => Ok(()),
          Ok(FromWorker::LoadFailed { message }) => {
            Err(format!("Plugin backend failed to load: {message}"))
          }
          _ => Err("Plugin worker sent an unexpected message".into()),
        },
        Ok(Frame::Closed(reason)) => Err(format!("Plugin worker exited while loading: {reason}")),
        _ => Err("Plugin backend did not load in time".into()),
      }
    })();
    match loaded {
      Ok(()) => Ok(process),
      Err(error) => {
        kill(&process.child);
        Err(error)
      }
    }
  }

  fn exchange(
    &self,
    host: &PluginHost,
    plugin: &ActivePlugin,
    process: &mut Process,
    id: u64,
    input: &str,
  ) -> Result<(String, Option<String>), Failure> {
    protocol::write_message(
      &mut process.stdin,
      &ToWorker::Call {
        id,
        input: input.to_owned(),
      },
    )
    .map_err(|error| Failure::Crash(error.to_string()))?;
    let mut guest_time = Duration::ZERO;
    loop {
      let waiting = Instant::now();
      let frame = match process
        .frames
        .recv_timeout(GUEST_TIMEOUT.saturating_sub(guest_time))
      {
        Ok(Frame::Data(frame)) => frame,
        Ok(Frame::Closed(reason)) => {
          return Err(Failure::Crash(format!("Plugin worker stopped: {reason}")));
        }
        Ok(Frame::Ready) | Err(RecvTimeoutError::Disconnected) => {
          return Err(Failure::Crash("Plugin worker stopped".into()));
        }
        Err(RecvTimeoutError::Timeout) => {
          return Err(Failure::Crash(
            "Plugin backend did not answer in time".into(),
          ));
        }
      };
      guest_time += waiting.elapsed();
      match serde_json::from_slice::<FromWorker>(&frame) {
        Ok(FromWorker::HostCall { id: call, request }) if call == id => {
          let fresh = host
            .authorize(&plugin.id, plugin.generation)
            .map_err(Failure::Denied)?;
          let output = host_api::handle(host, &fresh, &request);
          let encoded = protocol::encode_message(&ToWorker::HostResult { id, output })
            .map_err(|error| Failure::Crash(error.to_string()))?;
          let message = match encoded {
            Some(message) => message,
            None => protocol::encode_message(&ToWorker::HostResult {
              id,
              output: abi::error_envelope(
                "response_too_large",
                "Host response is too large to forward",
              ),
            })
            .map_err(|error| Failure::Crash(error.to_string()))?
            .ok_or_else(|| Failure::Crash("Host response frame too large".into()))?,
          };
          protocol::write_frame(&mut process.stdin, &message)
            .map_err(|error| Failure::Crash(error.to_string()))?;
        }
        Ok(FromWorker::Result { id: call, output }) if call == id => {
          return abi::validate_envelope(output.as_bytes())
            .map(|output| (output, None))
            .map_err(Failure::Crash);
        }
        Ok(FromWorker::Failed {
          id: call,
          code,
          message,
        }) if call == id => {
          return Ok((
            abi::error_envelope(&code, &message),
            Some(format!("{code}: {message}")),
          ));
        }
        _ => return Err(Failure::Crash("Plugin worker broke the protocol".into())),
      }
    }
  }

  /// Runs one guest command. `wait` false returns [`CallOutcome::Busy`]
  /// instead of queueing behind a call already in progress.
  pub fn call(
    &self,
    host: &PluginHost,
    plugin: &ActivePlugin,
    input: &str,
    wait: bool,
  ) -> CallOutcome {
    let slot = self.slot(&plugin.id);
    let mut slot = if wait {
      lock(&slot)
    } else {
      match slot.try_lock() {
        Ok(slot) => slot,
        Err(std::sync::TryLockError::WouldBlock) => return CallOutcome::Busy,
        Err(std::sync::TryLockError::Poisoned(poison)) => poison.into_inner(),
      }
    };
    if let Err(denied) = host.authorize(&plugin.id, plugin.generation) {
      return CallOutcome::Denied(denied);
    }
    if slot.generation != plugin.generation
      || slot
        .process
        .as_ref()
        .is_some_and(|process| process.child.lock().is_ok_and(|child| child.is_none()))
    {
      if let Some(process) = slot.process.take() {
        kill(&process.child);
      }
      slot.generation = plugin.generation;
    }

    let result = match slot.process.take() {
      Some(process) => Ok(process),
      None => self.spawn(plugin).map_err(Failure::Crash),
    }
    .and_then(|mut process| {
      slot.next_call += 1;
      let id = slot.next_call;
      let result = self.exchange(host, plugin, &mut process, id, input);
      if result.is_ok() {
        slot.process = Some(process);
      } else {
        kill(&process.child);
      }
      result
    });

    match result {
      Ok((output, host_failure)) => CallOutcome::Envelope {
        output,
        host_failure,
      },
      Err(Failure::Denied(denied)) => CallOutcome::Denied(denied),
      Err(Failure::Crash(reason)) => {
        if let Err(denied) = host.authorize(&plugin.id, plugin.generation) {
          return CallOutcome::Denied(denied);
        }
        log::warn!("[ExternalPlugins] {} worker failed: {reason}", plugin.id);
        if self.record_crash(&plugin.id) {
          host.quarantine(&plugin.id, plugin.generation, &reason);
        }
        CallOutcome::Envelope {
          output: abi::error_envelope("worker_failed", &reason),
          host_failure: Some(reason),
        }
      }
    }
  }
}
