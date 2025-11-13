use discord_rich_presence::{DiscordIpc, DiscordIpcClient, activity};
use std::sync::Mutex;

pub struct DiscordState {
  pub client: Mutex<Option<DiscordIpcClient>>,
}

impl DiscordState {
  pub fn new() -> Self {
    Self {
      client: Mutex::new(None),
    }
  }
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct DiscordActivity {
  pub details: Option<String>,
  pub state: Option<String>,
  pub large_image_key: Option<String>,
  pub large_image_text: Option<String>,
  pub small_image_key: Option<String>,
  pub small_image_text: Option<String>,
  pub start_timestamp: Option<i64>,
}

const MAX_CONNECT_ATTEMPTS: u8 = 3;
const MAX_SET_ATTEMPTS: u8 = 3;
const CONNECTION_STABILIZATION_DELAY_MS: u64 = 200;
const RETRY_DELAY_MS: u64 = 500;
const RECONNECT_DELAY_MS: u64 = 1000;

pub fn connect_discord(application_id: &str) -> Result<DiscordIpcClient, String> {
  log::info!(
    "Creating Discord client with application ID: {}",
    application_id
  );

  let mut client = DiscordIpcClient::new(application_id).map_err(|e| {
    log::error!("Failed to create Discord client: {}", e);
    format!("Failed to create Discord client: {}", e)
  })?;

  log::info!("Attempting to connect to Discord IPC...");
  client.connect().map_err(|e| {
    log::error!("Failed to connect to Discord: {}", e);
    format!(
      "Failed to connect to Discord: {}. Make sure Discord is running.",
      e
    )
  })?;

  log::info!("Successfully connected to Discord RPC");
  Ok(client)
}

pub fn set_presence(
  client: &mut DiscordIpcClient,
  activity_data: DiscordActivity,
) -> Result<(), String> {
  log::info!("Setting Discord presence with data: {:?}", activity_data);

  let mut activity_builder = activity::Activity::new();

  // Set details if provided
  if let Some(ref details) = activity_data.details {
    activity_builder = activity_builder.details(details);
    log::debug!("Set details: {}", details);
  }

  // Set state if provided
  if let Some(ref state) = activity_data.state {
    activity_builder = activity_builder.state(state);
    log::debug!("Set state: {}", state);
  }

  // Build assets if any image keys are provided (and they're not empty)
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

    if let Some(ref large_key) = activity_data.large_image_key
      && !large_key.is_empty()
    {
      assets = assets.large_image(large_key);
      log::debug!("Set large image: {}", large_key);
      if let Some(ref large_text) = activity_data.large_image_text
        && !large_text.is_empty()
      {
        assets = assets.large_text(large_text);
        log::debug!("Set large image text: {}", large_text);
      }
    }

    if let Some(ref small_key) = activity_data.small_image_key
      && !small_key.is_empty()
    {
      assets = assets.small_image(small_key);
      log::debug!("Set small image: {}", small_key);
      if let Some(ref small_text) = activity_data.small_image_text
        && !small_text.is_empty()
      {
        assets = assets.small_text(small_text);
        log::debug!("Set small image text: {}", small_text);
      }
    }

    activity_builder = activity_builder.assets(assets);
  } else {
    log::debug!("No assets to set (no image keys provided)");
  }

  // Set timestamp if provided
  if let Some(timestamp) = activity_data.start_timestamp {
    activity_builder = activity_builder.timestamps(activity::Timestamps::new().start(timestamp));
    log::debug!("Set start timestamp: {}", timestamp);
  }

  log::info!("Sending activity to Discord...");
  client.set_activity(activity_builder).map_err(|e| {
    log::error!("Failed to set Discord activity: {}", e);
    format!("Failed to set Discord activity: {}", e)
  })?;

  log::info!("Successfully set Discord presence");
  Ok(())
}

pub fn clear_presence(client: &mut DiscordIpcClient) -> Result<(), String> {
  client
    .clear_activity()
    .map_err(|e| format!("Failed to clear Discord activity: {}", e))?;

  log::info!("Successfully cleared Discord presence");
  Ok(())
}

pub fn disconnect_discord(client: &mut DiscordIpcClient) -> Result<(), String> {
  client
    .close()
    .map_err(|e| format!("Failed to disconnect from Discord: {}", e))?;

  log::info!("Successfully disconnected from Discord");
  Ok(())
}

pub async fn ensure_connection_and_set_presence(
  state: &DiscordState,
  application_id: &str,
  activity: DiscordActivity,
) -> Result<(), String> {
  log::info!("Setting Discord presence for app ID: {}", application_id);
  log::info!("Activity data: {:?}", activity);

  // Check if we need to create a new client
  let needs_new_client = {
    let client_lock = state
      .client
      .lock()
      .map_err(|e| format!("Failed to acquire Discord client lock: {}", e))?;
    client_lock.is_none()
  };

  // If client doesn't exist, create a new one
  if needs_new_client {
    log::info!("No Discord client found, attempting to connect...");

    let mut connect_attempts = 0;

    while connect_attempts < MAX_CONNECT_ATTEMPTS {
      match connect_discord(application_id) {
        Ok(client) => {
          log::info!("Successfully connected to Discord");

          {
            let mut client_lock = state
              .client
              .lock()
              .map_err(|e| format!("Failed to acquire Discord client lock: {}", e))?;
            *client_lock = Some(client);
          }

          tokio::time::sleep(tokio::time::Duration::from_millis(
            CONNECTION_STABILIZATION_DELAY_MS,
          ))
          .await;
          break;
        }
        Err(e) => {
          connect_attempts += 1;
          log::warn!("Connection attempt {} failed: {}", connect_attempts, e);

          if connect_attempts < MAX_CONNECT_ATTEMPTS {
            tokio::time::sleep(tokio::time::Duration::from_millis(RECONNECT_DELAY_MS)).await;
          }
        }
      }
    }

    if connect_attempts >= MAX_CONNECT_ATTEMPTS {
      log::error!(
        "Failed to connect to Discord after {} attempts",
        MAX_CONNECT_ATTEMPTS
      );
      log::info!("Discord might not be running or the Application ID might be invalid");
      return Err(
        "Failed to connect to Discord. Make sure Discord is running and you're logged in."
          .to_string(),
      );
    }
  }

  // Set the presence with retry logic
  let mut attempts = 0;

  while attempts < MAX_SET_ATTEMPTS {
    let result = {
      let mut client_lock = state
        .client
        .lock()
        .map_err(|e| format!("Failed to acquire Discord client lock: {}", e))?;

      if let Some(client) = client_lock.as_mut() {
        log::info!("Setting Discord presence... (attempt {})", attempts + 1);
        set_presence(client, activity.clone())
      } else {
        Err("No Discord client available".to_string())
      }
    };

    match result {
      Ok(_) => {
        log::info!("Discord presence set successfully");
        return Ok(());
      }
      Err(e) => {
        attempts += 1;
        log::warn!("Attempt {} failed to set Discord presence: {}", attempts, e);

        // If the IPC pipe was closed, try to reconnect
        let should_reconnect = e.contains("pipe")
          || e.contains("Pipe")
          || e.contains("os error 232")
          || e.contains("Broken pipe");

        if should_reconnect {
          log::info!("Detected closed Discord IPC pipe. Reconnecting...");

          {
            let mut client_lock = state
              .client
              .lock()
              .map_err(|e| format!("Failed to acquire Discord client lock: {}", e))?;
            *client_lock = None;
          }

          let mut reconnected = false;
          match connect_discord(application_id) {
            Ok(client) => {
              {
                let mut guard = state
                  .client
                  .lock()
                  .map_err(|e| format!("Failed to acquire Discord client lock: {}", e))?;
                *guard = Some(client);
              }
              reconnected = true;
            }
            Err(conn_err) => {
              log::warn!("Reconnection attempt failed: {}", conn_err);
            }
          }

          if reconnected {
            tokio::time::sleep(tokio::time::Duration::from_millis(
              CONNECTION_STABILIZATION_DELAY_MS,
            ))
            .await;
            log::info!("Reconnected to Discord IPC successfully");
          }
        }

        if attempts < MAX_SET_ATTEMPTS {
          tokio::time::sleep(tokio::time::Duration::from_millis(RETRY_DELAY_MS)).await;
        }
      }
    }
  }

  log::error!(
    "Failed to set Discord presence after {} attempts",
    MAX_SET_ATTEMPTS
  );
  Err("Failed to set Discord presence after multiple attempts".to_string())
}
