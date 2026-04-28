use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum GamePhase {
    NotRunning,
    MainMenu,
    Hideout,
    PartyHideout,
    InQueue,
    MatchIntro,
    InMatch,
    PostMatch,
    Spectating,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum MatchMode {
    Unknown,
    Unranked,
    Ranked,
    HeroLabs,
    PrivateLobby,
    BotMatch,
    Tutorial,
    Sandbox,
    Calibration,
    StreetBrawl,
}

impl MatchMode {
    pub fn display_text(&self) -> &'static str {
        match self {
            Self::Unknown => "Playing a Match",
            Self::Unranked => "Playing Standard (6v6)",
            Self::Ranked => "Playing Ranked (6v6)",
            Self::HeroLabs => "Playing Hero Labs",
            Self::PrivateLobby => "Playing Private Lobby",
            Self::BotMatch => "Playing in a Bot Match",
            Self::Tutorial => "Tutorial",
            Self::Sandbox => "Training in Sandbox Mode",
            Self::Calibration => "Placement Match",
            Self::StreetBrawl => "Playing Street Brawl (4v4)",
        }
    }
}

#[derive(Debug, Clone)]
pub struct GameState {
    pub phase: GamePhase,
    pub match_mode: MatchMode,
    pub hero_key: Option<String>,
    pub is_transformed: bool,
    pub party_size: u32,
    pub map_name: Option<String>,
    pub is_loopback: bool,
    pub match_start_time: Option<f64>,
    pub queue_start_time: Option<f64>,
    pub session_start_time: Option<f64>,
    pub game_state_id: Option<u32>,
    pub player_count: u32,
    pub bot_count: u32,
}

impl GameState {
    pub fn new() -> Self {
        Self {
            phase: GamePhase::NotRunning,
            match_mode: MatchMode::Unknown,
            hero_key: None,
            is_transformed: false,
            party_size: 1,
            map_name: None,
            is_loopback: false,
            match_start_time: None,
            queue_start_time: None,
            session_start_time: None,
            game_state_id: None,
            player_count: 0,
            bot_count: 0,
        }
    }

    pub fn in_party(&self) -> bool {
        self.party_size > 1
    }

    pub fn enter_main_menu(&mut self) {
        self.phase = GamePhase::MainMenu;
        self.clear_match();
    }

    pub fn enter_hideout(&mut self) {
        self.phase = if self.in_party() {
            GamePhase::PartyHideout
        } else {
            GamePhase::Hideout
        };
        self.clear_match();
        self.is_loopback = true;
    }

    pub fn enter_queue(&mut self) {
        self.phase = GamePhase::InQueue;
        self.queue_start_time = Some(now_epoch());
    }

    pub fn leave_queue(&mut self) {
        self.queue_start_time = None;
        self.enter_hideout();
    }

    pub fn enter_spectating(&mut self) {
        self.phase = GamePhase::Spectating;
        self.hero_key = None;
        self.is_transformed = false;
        self.match_start_time = None;
        self.queue_start_time = None;
    }

    pub fn enter_match_intro(&mut self) {
        self.phase = GamePhase::MatchIntro;
        self.game_state_id = Some(4);
    }

    pub fn start_match(&mut self, mode: MatchMode) {
        self.phase = GamePhase::InMatch;
        if mode != MatchMode::Unknown {
            self.match_mode = mode;
        }
        if self.match_start_time.is_none() {
            self.match_start_time = Some(now_epoch());
        }
        self.queue_start_time = None;
        self.game_state_id = Some(5);
    }

    pub fn end_match(&mut self) {
        self.phase = GamePhase::PostMatch;
        self.match_start_time = None;
        self.game_state_id = Some(6);
    }

    pub fn set_hero(&mut self, hero_key: &str) {
        let normalized = hero_key.to_lowercase().replace("hero_", "");
        if self.hero_key.as_deref() != Some(&normalized) {
            self.hero_key = Some(normalized);
            self.is_transformed = false;
        }
    }

    pub fn set_party_size(&mut self, size: u32) {
        self.party_size = size.max(1);
        if matches!(self.phase, GamePhase::Hideout | GamePhase::PartyHideout) {
            self.phase = if self.in_party() {
                GamePhase::PartyHideout
            } else {
                GamePhase::Hideout
            };
        }
    }

    pub fn connect_to_server(&mut self, address: &str) {
        self.is_loopback = address.to_lowercase().contains("loopback");
    }

    fn clear_match(&mut self) {
        self.match_mode = MatchMode::Unknown;
        self.match_start_time = None;
        self.map_name = None;
        self.game_state_id = None;
        self.is_transformed = false;
        self.bot_count = 0;
    }

    pub fn reset(&mut self) {
        self.clear_match();
        self.phase = GamePhase::NotRunning;
        self.hero_key = None;
        self.party_size = 1;
        self.queue_start_time = None;
        self.session_start_time = None;
        self.is_loopback = false;
        self.player_count = 0;
    }
}

impl Default for GameState {
    fn default() -> Self {
        Self::new()
    }
}

pub(crate) fn now_epoch() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs_f64()
}

#[cfg(test)]
mod tests {
    use super::{GameState, MatchMode};

    #[test]
    fn start_match_preserves_inferred_mode_when_mode_is_unknown() {
        let mut state = GameState::new();
        state.match_mode = MatchMode::StreetBrawl;

        state.start_match(MatchMode::Unknown);

        assert_eq!(state.match_mode, MatchMode::StreetBrawl);
    }

    #[test]
    fn start_match_replaces_mode_when_specific_mode_is_known() {
        let mut state = GameState::new();
        state.match_mode = MatchMode::BotMatch;

        state.start_match(MatchMode::Unranked);

        assert_eq!(state.match_mode, MatchMode::Unranked);
    }
}
