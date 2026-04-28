use crate::game_state_watcher::hero_data::HeroDataStore;
use crate::game_state_watcher::log_parser::LogParser;
use crate::game_state_watcher::presence_builder::build_presence;
use crate::game_state_watcher::state::GameState;
use discord_rich_presence::{DiscordIpc, DiscordIpcClient, activity};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

const POLL_INTERVAL_MS: u64 = 1500;
const PRESENCE_UPDATE_INTERVAL_MS: u64 = 15000;
const RESYNC_MAX_BYTES: u64 = 10 * 1024 * 1024;
const PROCESS_NAMES: &[&str] = &["project8.exe", "deadlock.exe"];
const DISCORD_APP_ID: &str = "1474302474474094634";

pub struct GamePresenceWatcher {
  game_path: PathBuf,
  console_log_path: PathBuf,
  running: Arc<AtomicBool>,
}

impl GamePresenceWatcher {
  pub fn new(game_path: PathBuf, running: Arc<AtomicBool>) -> Self {
    let console_log_path = game_path.join("game").join("citadel").join("console.log");
    Self {
      game_path,
      console_log_path,
      running,
    }
  }

  pub async fn run(&self) {
    let cache_dir = self.game_path.join("game").join("citadel");
    let mut hero_store = HeroDataStore::new(&cache_dir);
    hero_store.load().await;

    let mut discord_client: Option<DiscordIpcClient> = None;
    let mut state = GameState::new();
    let mut parser = LogParser::new();
    let mut last_offset: u64 = 0;
    let mut game_was_running = false;
    let mut last_presence_hash: Option<String> = None;
    let mut last_presence_update = std::time::Instant::now();

    log::info!("[GamePresence] Watcher started, monitoring: {:?}", self.console_log_path);

    while self.running.load(Ordering::Relaxed) {
      let game_running = is_game_running();

      if game_running && !game_was_running {
        log::info!("[GamePresence] Deadlock detected");
        game_was_running = true;
        state.session_start_time = Some(now_epoch());
        state.enter_main_menu();

        resync(&self.console_log_path, &mut parser, &mut state, &mut last_offset);
        last_offset = file_size(&self.console_log_path);

        if discord_client.is_none() {
          discord_client = connect_discord();
        }
        update_presence(&mut discord_client, &state, &hero_store, &mut last_presence_hash);
        last_presence_update = std::time::Instant::now();
      } else if !game_running && game_was_running {
        log::info!("[GamePresence] Deadlock closed");
        game_was_running = false;
        parser.reset_tracking();
        state.reset();
        clear_and_disconnect(&mut discord_client);
        last_presence_hash = None;
        last_offset = 0;
        tokio::time::sleep(tokio::time::Duration::from_millis(POLL_INTERVAL_MS * 3)).await;
        continue;
      } else if !game_running {
        tokio::time::sleep(tokio::time::Duration::from_millis(POLL_INTERVAL_MS * 3)).await;
        continue;
      }

      let current_size = file_size(&self.console_log_path);
      if current_size < last_offset {
        last_offset = 0;
        resync(&self.console_log_path, &mut parser, &mut state, &mut last_offset);
      }

      let mut changed = false;
      if let Some(new_content) = read_new_content(&self.console_log_path, &mut last_offset) {
        for line in new_content.lines() {
          let trimmed = line.trim();
          if !trimmed.is_empty() {
            changed |= parser.process_line(trimmed, &mut state);
          }
        }
      }

      if changed || last_presence_update.elapsed().as_millis() > PRESENCE_UPDATE_INTERVAL_MS as u128
      {
        if discord_client.is_none() {
          discord_client = connect_discord();
        }
        update_presence(&mut discord_client, &state, &hero_store, &mut last_presence_hash);
        last_presence_update = std::time::Instant::now();
      }

      tokio::time::sleep(tokio::time::Duration::from_millis(POLL_INTERVAL_MS)).await;
    }

    clear_and_disconnect(&mut discord_client);
    log::info!("[GamePresence] Watcher stopped");
  }
}

fn connect_discord() -> Option<DiscordIpcClient> {
  for pipe_id in 0..10 {
    match DiscordIpcClient::new(DISCORD_APP_ID) {
      Ok(mut client) => match client.connect() {
        Ok(_) => {
          log::info!("[GamePresence] Connected to Discord RPC on pipe {pipe_id}");
          return Some(client);
        }
        Err(e) => {
          log::debug!("[GamePresence] Pipe {pipe_id} unavailable: {e}");
        }
      },
      Err(e) => {
        log::debug!("[GamePresence] Failed to create client for pipe {pipe_id}: {e}");
      }
    }
  }
  log::warn!("[GamePresence] Could not connect to Discord on any IPC pipe");
  None
}

fn update_presence(
  client: &mut Option<DiscordIpcClient>,
  state: &GameState,
  hero_store: &HeroDataStore,
  last_hash: &mut Option<String>,
) {
  let Some(client) = client.as_mut() else {
    return;
  };

  let Some(activity_data) = build_presence(state, hero_store) else {
    let _ = client.clear_activity();
    *last_hash = None;
    return;
  };

  let hash = format!("{:?}", activity_data);
  if last_hash.as_ref() == Some(&hash) {
    return;
  }

  let mut act = activity::Activity::new();

  if let Some(ref details) = activity_data.details {
    act = act.details(details);
  }
  if let Some(ref s) = activity_data.state {
    act = act.state(s);
  }

  let has_large = activity_data
    .large_image_key
    .as_ref()
    .is_some_and(|k| !k.is_empty());
  let has_small = activity_data
    .small_image_key
    .as_ref()
    .is_some_and(|k| !k.is_empty());

  if has_large || has_small {
    let mut assets = activity::Assets::new();
    if let Some(ref key) = activity_data.large_image_key
      && !key.is_empty()
    {
      assets = assets.large_image(key);
      if let Some(ref text) = activity_data.large_image_text
        && !text.is_empty()
      {
        assets = assets.large_text(text);
      }
    }
    if let Some(ref key) = activity_data.small_image_key
      && !key.is_empty()
    {
      assets = assets.small_image(key);
      if let Some(ref text) = activity_data.small_image_text
        && !text.is_empty()
      {
        assets = assets.small_text(text);
      }
    }
    act = act.assets(assets);
  }

  if let Some(ts) = activity_data.start_timestamp {
    act = act.timestamps(activity::Timestamps::new().start(ts));
  }

  if let Err(e) = client.set_activity(act) {
    log::warn!("[GamePresence] Failed to set activity: {e}");
  } else {
    *last_hash = Some(hash);
  }
}

fn clear_and_disconnect(client: &mut Option<DiscordIpcClient>) {
  if let Some(c) = client.as_mut() {
    let _ = c.clear_activity();
    let _ = c.close();
  }
  *client = None;
}

fn is_game_running() -> bool {
  let sys = sysinfo::System::new_with_specifics(
    sysinfo::RefreshKind::nothing().with_processes(sysinfo::ProcessRefreshKind::nothing()),
  );
  for proc_name in PROCESS_NAMES {
    if sys
      .processes_by_exact_name(std::ffi::OsStr::new(proc_name))
      .next()
      .is_some()
    {
      return true;
    }
  }
  false
}

fn file_size(path: &Path) -> u64 {
  std::fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

fn read_new_content(path: &Path, last_offset: &mut u64) -> Option<String> {
  let mut file = std::fs::File::open(path).ok()?;
  let current_len = file.metadata().ok()?.len();

  if current_len < *last_offset {
    *last_offset = 0;
  }
  if current_len <= *last_offset {
    return None;
  }

  file.seek(SeekFrom::Start(*last_offset)).ok()?;
  let to_read = (current_len - *last_offset) as usize;
  let mut buf = vec![0u8; to_read];
  file.read_exact(&mut buf).ok()?;
  *last_offset = current_len;

  String::from_utf8(buf).ok()
}

fn resync(path: &Path, parser: &mut LogParser, state: &mut GameState, last_offset: &mut u64) {
  if !path.exists() {
    return;
  }
  let Ok(file_len) = std::fs::metadata(path).map(|m| m.len()) else {
    return;
  };
  let read_start = file_len.saturating_sub(RESYNC_MAX_BYTES);

  let result = (|| -> Result<(), Box<dyn std::error::Error>> {
    let mut file = std::fs::File::open(path)?;
    file.seek(SeekFrom::Start(read_start))?;

    let bytes_to_read = (file_len - read_start) as usize;
    let mut buf = vec![0u8; bytes_to_read];
    file.read_exact(&mut buf)?;

    // Drop initial partial line if we started mid-file
    let content_start = if read_start > 0 {
      buf.iter().position(|&b| b == b'\n').map(|pos| pos + 1).unwrap_or(0)
    } else {
      0
    };

    let content = String::from_utf8(buf[content_start..].to_vec())?;

    for line in content.lines() {
      let trimmed = line.trim();
      if !trimmed.is_empty() {
        parser.process_line(trimmed, state);
      }
    }
    *last_offset = file_len;
    log::info!(
      "[GamePresence] Resynced from {} lines",
      content.lines().count()
    );
    Ok(())
  })();

  if let Err(e) = result {
    log::warn!("[GamePresence] Resync error: {e}");
  }
}

fn now_epoch() -> f64 {
  std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .unwrap_or_default()
    .as_secs_f64()
}
