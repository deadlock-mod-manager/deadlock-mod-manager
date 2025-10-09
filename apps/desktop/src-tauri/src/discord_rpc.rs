use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
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

pub fn connect_discord(application_id: &str) -> Result<DiscordIpcClient, String> {
  log::info!("Creating Discord client with application ID: {}", application_id);
  
  let mut client = DiscordIpcClient::new(application_id)
    .map_err(|e| {
      log::error!("Failed to create Discord client: {}", e);
      format!("Failed to create Discord client: {}", e)
    })?;

  log::info!("Attempting to connect to Discord IPC...");
  client
    .connect()
    .map_err(|e| {
      log::error!("Failed to connect to Discord: {}", e);
      format!("Failed to connect to Discord: {}. Make sure Discord is running.", e)
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
    let has_large = activity_data.large_image_key.as_ref().map_or(false, |k| !k.is_empty());
    let has_small = activity_data.small_image_key.as_ref().map_or(false, |k| !k.is_empty());

    if has_large || has_small {
        let mut assets = activity::Assets::new();

        if let Some(ref large_key) = activity_data.large_image_key {
            if !large_key.is_empty() {
                assets = assets.large_image(large_key);
                log::debug!("Set large image: {}", large_key);
                if let Some(ref large_text) = activity_data.large_image_text {
                    if !large_text.is_empty() {
                        assets = assets.large_text(large_text);
                        log::debug!("Set large image text: {}", large_text);
                    }
                }
            }
        }

        if let Some(ref small_key) = activity_data.small_image_key {
            if !small_key.is_empty() {
                assets = assets.small_image(small_key);
                log::debug!("Set small image: {}", small_key);
                if let Some(ref small_text) = activity_data.small_image_text {
                    if !small_text.is_empty() {
                        assets = assets.small_text(small_text);
                        log::debug!("Set small image text: {}", small_text);
                    }
                }
            }
        }

        activity_builder = activity_builder.assets(assets);
    } else {
        log::debug!("No assets to set (no image keys provided)");
    }

    // Set timestamp if provided
    if let Some(timestamp) = activity_data.start_timestamp {
        activity_builder = activity_builder.timestamps(
            activity::Timestamps::new().start(timestamp),
        );
        log::debug!("Set start timestamp: {}", timestamp);
    }

    log::info!("Sending activity to Discord...");
    client
        .set_activity(activity_builder)
        .map_err(|e| {
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

