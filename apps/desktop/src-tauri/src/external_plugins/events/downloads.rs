use super::publish;
use crate::download_manager::DownloadTask;
use crate::errors::Error;
use dmm_plugin_runtime::event_contract::{Download, DownloadProgress, HostEventData};
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

struct Observation {
  data: Download,
  operation: String,
  last_progress: Option<Instant>,
}
static RUNNING: LazyLock<Mutex<HashMap<String, Observation>>> = LazyLock::new(Mutex::default);

fn data(task: &DownloadTask) -> Download {
  Download {
    mod_id: task.mod_id.clone(),
    profile: task.profile_folder.as_deref().unwrap_or("default").into(),
  }
}

fn operation(id: u64) -> String {
  format!("download:{id}")
}

pub fn started(id: u64, task: &DownloadTask) {
  let mut running = RUNNING.lock().unwrap_or_else(|error| error.into_inner());
  let key = operation(id);
  if running
    .get(&task.mod_id)
    .is_some_and(|current| current.operation == key)
  {
    return;
  }
  let observation = Observation {
    data: data(task),
    operation: key,
    last_progress: None,
  };
  publish(
    HostEventData::DownloadStarted(observation.data.clone()),
    Some(observation.operation.clone()),
  );
  running.insert(task.mod_id.clone(), observation);
}

pub fn progress(mod_id: &str, downloaded_bytes: u64, total_bytes: u64) {
  let mut running = RUNNING.lock().unwrap_or_else(|error| error.into_inner());
  let Some(current) = running.get_mut(mod_id) else {
    return;
  };
  let now = Instant::now();
  if current
    .last_progress
    .is_some_and(|last| now.duration_since(last) < Duration::from_millis(500))
    && downloaded_bytes != total_bytes
  {
    return;
  }
  current.last_progress = Some(now);
  publish(
    HostEventData::DownloadProgress(DownloadProgress {
      mod_id: current.data.mod_id.clone(),
      profile: current.data.profile.clone(),
      downloaded_bytes,
      total_bytes,
    }),
    Some(current.operation.clone()),
  );
}

pub fn finished(id: u64, task: &DownloadTask, result: Result<(), &Error>) {
  let mut running = RUNNING.lock().unwrap_or_else(|error| error.into_inner());
  if running
    .get(&task.mod_id)
    .is_some_and(|current| current.operation == operation(id))
  {
    running.remove(&task.mod_id);
  }
  let event = match result {
    Ok(()) => HostEventData::DownloadCompleted(data(task)),
    Err(Error::DownloadCancelled) => HostEventData::DownloadCancelled(data(task)),
    Err(_) => HostEventData::DownloadFailed(data(task)),
  };
  publish(event, Some(operation(id)));
}

pub fn paused(mod_id: &str) {
  status(mod_id, HostEventData::DownloadPaused);
}
pub fn resumed(mod_id: &str) {
  status(mod_id, HostEventData::DownloadResumed);
}

pub fn queued_status(id: u64, task: &DownloadTask, paused: bool) {
  let event = if paused {
    HostEventData::DownloadPaused(data(task))
  } else {
    HostEventData::DownloadResumed(data(task))
  };
  publish(event, Some(operation(id)));
}

fn status(mod_id: &str, event: fn(Download) -> HostEventData) {
  let running = RUNNING.lock().unwrap_or_else(|error| error.into_inner());
  if let Some(current) = running.get(mod_id) {
    publish(event(current.data.clone()), Some(current.operation.clone()));
  }
}
