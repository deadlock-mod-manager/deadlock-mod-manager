use crate::discord_rpc::DiscordActivity;
use crate::game_state_watcher::hero_data::HeroDataStore;
use crate::game_state_watcher::state::{GamePhase, GameState, MatchMode};

const PARTY_MAX: u32 = 6;
const LOGO_ASSET: &str = "deadlock_logo";
const LOGO_TEXT: &str = "Deadlock";

pub fn build_presence(state: &GameState, hero_store: &HeroDataStore) -> Option<DiscordActivity> {
  if state.phase == GamePhase::NotRunning {
    return None;
  }

  let hero_display = state
    .hero_key
    .as_deref()
    .map(|k| hero_store.display_name(k));
  let hero_asset = state
    .hero_key
    .as_deref()
    .map(|k| resolve_hero_asset(state, k, hero_store));

  let mut large_image_key = hero_asset.clone().or_else(|| Some(LOGO_ASSET.to_string()));
  let mut large_image_text = Some(LOGO_TEXT.to_string());
  let mut small_image_key: Option<String> = None;
  let mut small_image_text: Option<String> = None;
  #[allow(unused_assignments)]
  let mut details: Option<String> = None;
  let mut state_text: Option<String> = None;
  let mut start_timestamp: Option<i64> = None;

  if hero_display.is_some() {
    small_image_key = Some(LOGO_ASSET.to_string());
    small_image_text = hero_display.clone();
  }

  match state.phase {
    GamePhase::MainMenu => {
      details = Some("Main Menu".to_string());
      large_image_key = Some(LOGO_ASSET.to_string());
      large_image_text = Some(LOGO_TEXT.to_string());
    }

    GamePhase::Hideout => {
      let hideout_text = state
        .hero_key
        .as_deref()
        .map(|k| hero_store.hideout_text(k))
        .unwrap_or_else(|| "In the Hideout".to_string());
      details = Some(hideout_text);
      state_text = Some(format!("Playing Solo (1 of {PARTY_MAX})"));
      small_image_key = None;
      small_image_text = None;
    }

    GamePhase::PartyHideout => {
      let hideout_text = state
        .hero_key
        .as_deref()
        .map(|k| hero_store.hideout_text(k))
        .unwrap_or_else(|| "In the Hideout".to_string());
      details = Some(hideout_text);
      state_text = Some(format!("Party of {}", state.party_size));
      small_image_key = None;
      small_image_text = None;
    }

    GamePhase::InQueue => {
      details = Some("Looking for Match...".to_string());
      if state.in_party() {
        state_text = Some(format!("In Queue {}", state.party_size));
      }
    }

    GamePhase::MatchIntro | GamePhase::InMatch => {
      let mode_str = state.match_mode.display_text();
      if state.in_party() {
        details = if let Some(ref hero) = hero_display {
          Some(format!(" {mode_str} \u{00b7} {hero}"))
        } else {
          Some(format!(" {mode_str}"))
        };
        state_text = Some(format!("Party of {}", state.party_size));
      } else if let Some(ref hero) = hero_display {
        details = Some(format!(" {mode_str}"));
        state_text = Some(format!("Playing as {hero}"));
      } else {
        details = Some(format!(" {mode_str}"));
      }

      if state.phase == GamePhase::InMatch
        && !matches!(state.match_mode, MatchMode::Sandbox | MatchMode::Tutorial)
      {
        if let Some(match_start) = state.match_start_time {
          start_timestamp = Some(match_start as i64);
        }
      }
    }

    GamePhase::PostMatch => {
      details = Some("Post-Match".to_string());
    }

    GamePhase::Spectating => {
      details = Some("Spectating a Match".to_string());
      large_image_key = Some(LOGO_ASSET.to_string());
      large_image_text = Some(LOGO_TEXT.to_string());
      small_image_key = None;
      small_image_text = None;
    }

    GamePhase::NotRunning => unreachable!(),
  }

  if start_timestamp.is_none() {
    if let Some(session_start) = state.session_start_time {
      start_timestamp = Some(session_start as i64);
    }
  }

  Some(DiscordActivity {
    details,
    state: state_text,
    large_image_key,
    large_image_text,
    small_image_key,
    small_image_text,
    start_timestamp,
  })
}

fn resolve_hero_asset(state: &GameState, codename: &str, hero_store: &HeroDataStore) -> String {
  let key = codename.to_lowercase();
  if (key == "werewolf" || key == "silver") && state.is_transformed {
    return "hero_werewolf_wolf".to_string();
  }
  hero_store.asset_key(&key)
}
