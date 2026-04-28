pub use deadlock_discord_presence::{DiscordActivity, DiscordPresenceState as DiscordState};

use deadlock_discord_presence::PresenceOwner;

pub async fn ensure_connection_and_set_presence(
  state: &DiscordState,
  application_id: &str,
  activity: DiscordActivity,
) -> Result<(), String> {
  state
    .set_activity(PresenceOwner::Plugin, application_id, activity)
    .await
}

pub async fn clear_presence(state: &DiscordState) -> Result<(), String> {
  state.clear_activity(PresenceOwner::Plugin).await
}

pub async fn disconnect_discord(state: &DiscordState) -> Result<(), String> {
  state.disconnect(PresenceOwner::Plugin).await
}
