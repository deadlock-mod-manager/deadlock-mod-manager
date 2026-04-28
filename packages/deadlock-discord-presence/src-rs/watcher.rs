use crate::config::PresenceBuildConfig;
use crate::hero_data::HeroDataStore;
use crate::log_parser::LogParser;
use crate::presence_builder::build_presence;
use crate::state::{GameState, now_epoch};
use crate::{DiscordPresenceState, PresenceOwner, SetActivityOptions};
use std::ffi::OsStr;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

const POLL_INTERVAL_MS: u64 = 1500;
const IDLE_POLL_INTERVAL_MS: u64 = 5000;
const PRESENCE_UPDATE_INTERVAL_MS: u64 = 15000;
const RESYNC_MAX_BYTES: u64 = 10 * 1024 * 1024;
const PROCESS_NAMES: &[&str] = &["project8.exe", "deadlock.exe", "project8"];
const DISCORD_APP_ID: &str = "1474302474474094634";
const GAME_PRESENCE_CONNECT_ATTEMPTS: u8 = 10;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PresencePhase {
    Waiting,
    Connecting,
    Connected,
    Error,
}

pub type PresenceStatusCallback = Arc<dyn Fn(PresencePhase) + Send + Sync>;

pub struct GamePresenceWatcher {
    game_path: PathBuf,
    console_log_path: PathBuf,
    running: Arc<AtomicBool>,
    discord_presence: DiscordPresenceState,
    status_callback: Option<PresenceStatusCallback>,
    presence_config: PresenceBuildConfig,
}

impl GamePresenceWatcher {
    pub fn new(
        game_path: PathBuf,
        running: Arc<AtomicBool>,
        discord_presence: DiscordPresenceState,
        status_callback: Option<PresenceStatusCallback>,
        presence_config: PresenceBuildConfig,
    ) -> Self {
        let console_log_path = game_path.join("game").join("citadel").join("console.log");
        Self {
            game_path,
            console_log_path,
            running,
            discord_presence,
            status_callback,
            presence_config,
        }
    }

    pub async fn run(&self) {
        let cache_dir = self.game_path.join("game").join("citadel");
        let mut hero_store = HeroDataStore::new(&cache_dir);
        hero_store.load().await;

        let mut state = GameState::new();
        let mut parser = LogParser::new();
        let mut last_offset: u64 = 0;
        let mut game_was_running = false;
        let mut last_presence_hash: Option<String> = None;
        let mut last_presence_update = std::time::Instant::now();
        let mut sys = sysinfo::System::new();

        log::info!(
            "[GamePresence] Watcher started, monitoring: {:?}",
            self.console_log_path
        );

        while self.running.load(Ordering::Relaxed) {
            let game_running = is_game_running(&mut sys, &self.console_log_path);

            if game_running && !game_was_running {
                log::info!("[GamePresence] Deadlock detected");
                game_was_running = true;
                state.session_start_time = Some(now_epoch());
                state.enter_main_menu();

                resync(
                    &self.console_log_path,
                    &mut parser,
                    &mut state,
                    &hero_store,
                    &mut last_offset,
                );
                last_offset = file_size(&self.console_log_path);

                update_presence(
                    &self.discord_presence,
                    self.status_callback.as_ref(),
                    &state,
                    &hero_store,
                    &self.presence_config,
                    &mut last_presence_hash,
                )
                .await;
                last_presence_update = std::time::Instant::now();
            } else if !game_running {
                if game_was_running {
                    log::info!("[GamePresence] Deadlock closed");
                    game_was_running = false;
                    parser.reset_tracking();
                    state.reset();
                    if let Err(error) = self
                        .discord_presence
                        .disconnect(PresenceOwner::GamePresence)
                        .await
                    {
                        log::debug!("[GamePresence] Discord disconnect skipped: {error}");
                    }
                    self.emit_phase(PresencePhase::Waiting);
                    last_presence_hash = None;
                    last_offset = 0;
                }
                tokio::time::sleep(tokio::time::Duration::from_millis(IDLE_POLL_INTERVAL_MS)).await;
                continue;
            }

            let current_size = file_size(&self.console_log_path);
            if current_size < last_offset {
                last_offset = 0;
                resync(
                    &self.console_log_path,
                    &mut parser,
                    &mut state,
                    &hero_store,
                    &mut last_offset,
                );
            }

            let mut changed = false;
            if let Some(new_content) = read_new_content(&self.console_log_path, &mut last_offset) {
                for line in new_content.lines() {
                    let trimmed = line.trim();
                    if !trimmed.is_empty() {
                        changed |= parser.process_line(trimmed, &mut state, &hero_store);
                    }
                }
            }

            if changed
                || last_presence_update.elapsed().as_millis() > PRESENCE_UPDATE_INTERVAL_MS as u128
            {
                update_presence(
                    &self.discord_presence,
                    self.status_callback.as_ref(),
                    &state,
                    &hero_store,
                    &self.presence_config,
                    &mut last_presence_hash,
                )
                .await;
                last_presence_update = std::time::Instant::now();
            }

            tokio::time::sleep(tokio::time::Duration::from_millis(POLL_INTERVAL_MS)).await;
        }

        if let Err(error) = self
            .discord_presence
            .disconnect(PresenceOwner::GamePresence)
            .await
        {
            log::debug!("[GamePresence] Discord disconnect skipped: {error}");
        }
        log::info!("[GamePresence] Watcher stopped");
    }

    fn emit_phase(&self, phase: PresencePhase) {
        if let Some(callback) = &self.status_callback {
            callback(phase);
        }
    }
}

async fn update_presence(
    discord_presence: &DiscordPresenceState,
    status_callback: Option<&PresenceStatusCallback>,
    state: &GameState,
    hero_store: &HeroDataStore,
    presence_config: &PresenceBuildConfig,
    last_hash: &mut Option<String>,
) {
    let Some(activity_data) = build_presence(state, hero_store, presence_config) else {
        if let Err(error) = discord_presence
            .clear_activity(PresenceOwner::GamePresence)
            .await
        {
            log::debug!("[GamePresence] Discord clear skipped: {error}");
        }
        *last_hash = None;
        return;
    };

    let hash = format!("{activity_data:?}");
    if last_hash.as_ref() == Some(&hash) {
        return;
    }

    emit_phase(status_callback, PresencePhase::Connecting);
    let result = discord_presence
        .set_activity_with_options(
            PresenceOwner::GamePresence,
            DISCORD_APP_ID,
            activity_data,
            SetActivityOptions {
                connect_attempts: GAME_PRESENCE_CONNECT_ATTEMPTS,
                ..SetActivityOptions::default()
            },
        )
        .await;

    if let Err(error) = result {
        log::warn!("[GamePresence] Failed to set activity: {error}");
        emit_phase(status_callback, PresencePhase::Error);
        if let Err(disconnect_error) = discord_presence
            .disconnect(PresenceOwner::GamePresence)
            .await
        {
            log::debug!("[GamePresence] Discord disconnect skipped: {disconnect_error}");
        }
        *last_hash = None;
    } else {
        emit_phase(status_callback, PresencePhase::Connected);
        *last_hash = Some(hash);
    }
}

fn emit_phase(status_callback: Option<&PresenceStatusCallback>, phase: PresencePhase) {
    if let Some(callback) = status_callback {
        callback(phase);
    }
}

fn is_game_running(sys: &mut sysinfo::System, console_log_path: &Path) -> bool {
    sys.refresh_processes_specifics(
        sysinfo::ProcessesToUpdate::All,
        true,
        sysinfo::ProcessRefreshKind::nothing(),
    );
    for proc_name in PROCESS_NAMES {
        if sys
            .processes_by_exact_name(OsStr::new(proc_name))
            .next()
            .is_some()
        {
            return true;
        }
    }
    is_recent_log_active(console_log_path)
}

#[cfg(target_os = "windows")]
fn is_recent_log_active(_path: &Path) -> bool {
    false
}

#[cfg(not(target_os = "windows"))]
fn is_recent_log_active(path: &Path) -> bool {
    let Ok(metadata) = std::fs::metadata(path) else {
        return false;
    };
    let Ok(modified) = metadata.modified() else {
        return false;
    };
    modified
        .elapsed()
        .is_ok_and(|age| age <= std::time::Duration::from_secs(60))
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

    Some(String::from_utf8_lossy(&buf).into_owned())
}

fn resync(
    path: &Path,
    parser: &mut LogParser,
    state: &mut GameState,
    hero_store: &HeroDataStore,
    last_offset: &mut u64,
) {
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

        let content_start = if read_start > 0 {
            buf.iter()
                .position(|&b| b == b'\n')
                .map(|pos| pos + 1)
                .unwrap_or(0)
        } else {
            0
        };

        let content = String::from_utf8_lossy(&buf[content_start..]).into_owned();

        for line in content.lines() {
            let trimmed = line.trim();
            if !trimmed.is_empty() {
                parser.process_line(trimmed, state, hero_store);
            }
        }
        *last_offset = file_len;
        log::info!(
            "[GamePresence] Resynced tail ({} lines)",
            content.lines().count()
        );
        Ok(())
    })();

    if let Err(e) = result {
        log::warn!("[GamePresence] Resync error: {e}");
    }
}

#[cfg(test)]
fn now_epoch_for_test() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
}

#[cfg(test)]
mod tests {
    use super::read_new_content;
    use std::path::PathBuf;

    #[test]
    fn read_new_content_tolerates_invalid_utf8() {
        let path = temp_console_log_path();
        std::fs::write(&path, [b'v', b'a', b'l', b'i', b'd', 0xff])
            .expect("test console log should be writable");
        let mut offset = 0;

        let content = read_new_content(&path, &mut offset).expect("content should be readable");

        assert!(content.contains("valid"));
        assert_eq!(offset, 6);
        let _ = std::fs::remove_file(path);
    }

    fn temp_console_log_path() -> PathBuf {
        let unique = format!(
            "deadlock_presence_test_{}_{}.log",
            std::process::id(),
            super::now_epoch_for_test()
        );
        std::env::temp_dir().join(unique)
    }
}
