use discord_rich_presence::{DiscordIpc, DiscordIpcClient, activity};
use std::sync::{Arc, Mutex};

const MAX_CONNECT_ATTEMPTS: u8 = 3;
const MAX_SET_ATTEMPTS: u8 = 3;
const CONNECTION_STABILIZATION_DELAY_MS: u64 = 200;
const RETRY_DELAY_MS: u64 = 500;
const RECONNECT_DELAY_MS: u64 = 1000;

#[derive(Debug, Clone, serde::Deserialize, PartialEq, Eq)]
pub struct DiscordActivity {
    pub details: Option<String>,
    pub state: Option<String>,
    pub large_image_key: Option<String>,
    pub large_image_text: Option<String>,
    pub small_image_key: Option<String>,
    pub small_image_text: Option<String>,
    pub start_timestamp: Option<i64>,
    pub party_size: Option<[i32; 2]>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PresenceOwner {
    Plugin,
    GamePresence,
}

#[derive(Debug, Clone, Copy)]
pub struct SetActivityOptions {
    pub connect_attempts: u8,
    pub set_attempts: u8,
}

impl Default for SetActivityOptions {
    fn default() -> Self {
        Self {
            connect_attempts: MAX_CONNECT_ATTEMPTS,
            set_attempts: MAX_SET_ATTEMPTS,
        }
    }
}

#[derive(Clone, Default)]
pub struct DiscordPresenceState {
    inner: Arc<Mutex<DiscordPresenceInner>>,
}

#[derive(Default)]
struct DiscordPresenceInner {
    client: Option<DiscordIpcClient>,
    application_id: Option<String>,
    owner: Option<PresenceOwner>,
}

impl DiscordPresenceState {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn set_activity(
        &self,
        owner: PresenceOwner,
        application_id: &str,
        activity: DiscordActivity,
    ) -> Result<(), String> {
        self.set_activity_with_options(
            owner,
            application_id,
            activity,
            SetActivityOptions::default(),
        )
        .await
    }

    pub async fn set_activity_with_options(
        &self,
        owner: PresenceOwner,
        application_id: &str,
        activity: DiscordActivity,
        options: SetActivityOptions,
    ) -> Result<(), String> {
        self.ensure_connection(owner, application_id, options.connect_attempts)
            .await?;

        let mut attempts = 0;
        while attempts < options.set_attempts {
            let result = {
                let mut inner = self.lock_inner()?;
                inner.ensure_owner(owner)?;

                if let Some(client) = inner.client.as_mut() {
                    set_presence(client, activity.clone())
                } else {
                    Err("No Discord client available".to_string())
                }
            };

            match result {
                Ok(_) => {
                    return Ok(());
                }
                Err(error) => {
                    attempts += 1;
                    log::warn!("Attempt {attempts} failed to set Discord presence: {error}");

                    if is_closed_pipe_error(&error) {
                        self.drop_connection(owner)?;
                        if let Err(connect_error) = self
                            .ensure_connection(owner, application_id, options.connect_attempts)
                            .await
                        {
                            log::warn!("Discord reconnection attempt failed: {connect_error}");
                        }
                    }

                    if attempts < options.set_attempts {
                        tokio::time::sleep(tokio::time::Duration::from_millis(RETRY_DELAY_MS))
                            .await;
                    }
                }
            }
        }

        Err("Failed to set Discord presence after multiple attempts".to_string())
    }

    pub async fn clear_activity(&self, owner: PresenceOwner) -> Result<(), String> {
        let mut inner = self.lock_inner()?;
        inner.ensure_owner(owner)?;

        if let Some(client) = inner.client.as_mut() {
            clear_presence(client)?;
        }

        Ok(())
    }

    pub async fn disconnect(&self, owner: PresenceOwner) -> Result<(), String> {
        let mut inner = self.lock_inner()?;
        inner.ensure_owner(owner)?;

        if let Some(client) = inner.client.as_mut() {
            clear_presence(client)?;
            disconnect_discord(client)?;
        }

        inner.client = None;
        inner.application_id = None;
        inner.owner = None;
        Ok(())
    }

    async fn ensure_connection(
        &self,
        owner: PresenceOwner,
        application_id: &str,
        max_attempts: u8,
    ) -> Result<(), String> {
        {
            let mut inner = self.lock_inner()?;
            inner.ensure_owner(owner)?;

            if inner.client.is_some() && inner.application_id.as_deref() == Some(application_id) {
                inner.owner = Some(owner);
                return Ok(());
            }

            if let Some(client) = inner.client.as_mut() {
                let _ = client.clear_activity();
                let _ = client.close();
            }

            inner.client = None;
            inner.application_id = None;
            inner.owner = Some(owner);
        }

        let mut connect_attempts = 0;
        while connect_attempts < max_attempts {
            match connect_discord(application_id) {
                Ok(client) => {
                    {
                        let mut inner = self.lock_inner()?;
                        inner.ensure_owner(owner)?;
                        inner.client = Some(client);
                        inner.application_id = Some(application_id.to_string());
                        inner.owner = Some(owner);
                    }

                    tokio::time::sleep(tokio::time::Duration::from_millis(
                        CONNECTION_STABILIZATION_DELAY_MS,
                    ))
                    .await;
                    return Ok(());
                }
                Err(error) => {
                    connect_attempts += 1;
                    log::warn!("Discord connection attempt {connect_attempts} failed: {error}");

                    if connect_attempts < max_attempts {
                        tokio::time::sleep(tokio::time::Duration::from_millis(RECONNECT_DELAY_MS))
                            .await;
                    }
                }
            }
        }

        self.drop_connection(owner)?;
        Err(
            "Failed to connect to Discord. Make sure Discord is running and you're logged in."
                .to_string(),
        )
    }

    fn drop_connection(&self, owner: PresenceOwner) -> Result<(), String> {
        let mut inner = self.lock_inner()?;
        inner.ensure_owner(owner)?;

        if let Some(client) = inner.client.as_mut() {
            let _ = client.close();
        }

        inner.client = None;
        inner.application_id = None;
        Ok(())
    }

    fn lock_inner(&self) -> Result<std::sync::MutexGuard<'_, DiscordPresenceInner>, String> {
        self.inner
            .lock()
            .map_err(|e| format!("Failed to acquire Discord client lock: {e}"))
    }
}

impl DiscordPresenceInner {
    fn ensure_owner(&self, owner: PresenceOwner) -> Result<(), String> {
        if let Some(current_owner) = self.owner
            && current_owner != owner
        {
            return Err(format!(
                "Discord presence is currently owned by {current_owner:?}"
            ));
        }

        Ok(())
    }
}

fn connect_discord(application_id: &str) -> Result<DiscordIpcClient, String> {
    log::info!("Creating Discord client with application ID: {application_id}");

    let mut client = DiscordIpcClient::new(application_id).map_err(|e| {
        log::error!("Failed to create Discord client: {e}");
        format!("Failed to create Discord client: {e}")
    })?;

    log::info!("Attempting to connect to Discord IPC...");
    client.connect().map_err(|e| {
        log::error!("Failed to connect to Discord: {e}");
        format!("Failed to connect to Discord: {e}. Make sure Discord is running.")
    })?;

    log::info!("Successfully connected to Discord RPC");
    Ok(client)
}

fn set_presence(
    client: &mut DiscordIpcClient,
    activity_data: DiscordActivity,
) -> Result<(), String> {
    log::info!("Setting Discord presence with data: {activity_data:?}");

    let mut activity_builder = activity::Activity::new();

    if let Some(ref details) = activity_data.details {
        activity_builder = activity_builder.details(details);
    }

    if let Some(ref state) = activity_data.state {
        activity_builder = activity_builder.state(state);
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

        if let Some(ref large_key) = activity_data.large_image_key
            && !large_key.is_empty()
        {
            assets = assets.large_image(large_key);

            if let Some(ref large_text) = activity_data.large_image_text
                && !large_text.is_empty()
            {
                assets = assets.large_text(large_text);
            }
        }

        if let Some(ref small_key) = activity_data.small_image_key
            && !small_key.is_empty()
        {
            assets = assets.small_image(small_key);

            if let Some(ref small_text) = activity_data.small_image_text
                && !small_text.is_empty()
            {
                assets = assets.small_text(small_text);
            }
        }

        activity_builder = activity_builder.assets(assets);
    }

    if let Some(timestamp) = activity_data.start_timestamp {
        activity_builder =
            activity_builder.timestamps(activity::Timestamps::new().start(timestamp));
    }

    if let Some(party_size) = activity_data.party_size {
        activity_builder = activity_builder.party(activity::Party::new().size(party_size));
    }

    client.set_activity(activity_builder).map_err(|e| {
        log::error!("Failed to set Discord activity: {e}");
        format!("Failed to set Discord activity: {e}")
    })?;

    log::info!("Successfully set Discord presence");
    Ok(())
}

fn clear_presence(client: &mut DiscordIpcClient) -> Result<(), String> {
    client
        .clear_activity()
        .map_err(|e| format!("Failed to clear Discord activity: {e}"))?;

    log::info!("Successfully cleared Discord presence");
    Ok(())
}

fn disconnect_discord(client: &mut DiscordIpcClient) -> Result<(), String> {
    client
        .close()
        .map_err(|e| format!("Failed to disconnect from Discord: {e}"))?;

    log::info!("Successfully disconnected from Discord");
    Ok(())
}

fn is_closed_pipe_error(error: &str) -> bool {
    error.contains("pipe")
        || error.contains("Pipe")
        || error.contains("os error 232")
        || error.contains("Broken pipe")
}
