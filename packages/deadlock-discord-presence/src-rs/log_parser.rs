use crate::hero_data::HeroDataStore;
use crate::patterns::PATTERNS;
use crate::state::{GamePhase, GameState, MatchMode};
use std::collections::HashSet;

const HIDEOUT_MAPS: &[&str] = &["dl_hideout"];

struct MapToMode {
    map: &'static str,
    mode: MatchMode,
}

const MAP_TO_MODE: &[MapToMode] = &[
    MapToMode {
        map: "street_test",
        mode: MatchMode::Unranked,
    },
    MapToMode {
        map: "street_test_bridge",
        mode: MatchMode::Unranked,
    },
    MapToMode {
        map: "new_player_basics",
        mode: MatchMode::Sandbox,
    },
    MapToMode {
        map: "dl_midtown",
        mode: MatchMode::Unknown,
    },
];

pub struct LogParser {
    hero_window_open: bool,
    hideout_loaded: bool,
    bot_init_count: u32,
    local_account_id: Option<u64>,
    party_id: Option<u64>,
    party_members: HashSet<u64>,
}

impl LogParser {
    pub fn new() -> Self {
        Self {
            hero_window_open: true,
            hideout_loaded: false,
            bot_init_count: 0,
            local_account_id: None,
            party_id: None,
            party_members: HashSet::new(),
        }
    }

    pub fn process_line(
        &mut self,
        line: &str,
        state: &mut GameState,
        hero_store: &HeroDataStore,
    ) -> bool {
        let old_phase = state.phase;
        let old_hero = state.hero_key.clone();
        let old_mode = state.match_mode;
        let old_transformed = state.is_transformed;
        let old_party = state.party_size;

        let current_map = state.map_name.as_deref().unwrap_or("").to_lowercase();
        let in_hideout_map = HIDEOUT_MAPS.contains(&current_map.as_str());
        let p = &*PATTERNS;

        if self.local_account_id.is_none() {
            if let Some(caps) = p.local_account_id.captures(line) {
                if let Ok(id) = caps[1].parse::<u64>() {
                    self.local_account_id = Some(id);
                    if self.party_id.is_some() {
                        self.party_members.insert(id);
                        self.set_party_size_from_members(state, 2);
                    }
                }
            }
        }

        if let Some(caps) = p.party_event.captures(line) {
            let party_id: u64 = caps[1].parse().unwrap_or(0);
            let event_name = &caps[2];
            let account_id: u64 = caps[3].parse().unwrap_or(0);
            self.apply_party_event(state, party_id, event_name, account_id);
        } else if let Some(caps) = p.map_info.captures(line) {
            self.apply_map(state, &caps[1]);
        } else if let Some(caps) = p.map_created_physics.captures(line) {
            self.apply_map(state, &caps[1]);
        } else if p.mm_start.is_match(line) {
            if matches!(
                state.phase,
                GamePhase::Hideout | GamePhase::PartyHideout | GamePhase::MainMenu
            ) {
                state.enter_queue();
            }
        } else if p.mm_stop.is_match(line) {
            if state.phase == GamePhase::InQueue {
                state.leave_queue();
            }
        } else if p.lobby_created.is_match(line) {
            state.queue_start_time = None;
            self.prepare_match_hero_tracking(state);
            if matches!(
                state.phase,
                GamePhase::MainMenu
                    | GamePhase::Hideout
                    | GamePhase::PartyHideout
                    | GamePhase::InQueue
            ) {
                state.enter_match_intro();
            }
        } else if p.lobby_destroyed.is_match(line) {
            state.end_match();
        } else if p.spectate_broadcast.is_match(line) {
            state.enter_spectating();
            self.hideout_loaded = false;
        } else if let Some(caps) = p.server_connect.captures(line) {
            let addr = &caps[1];
            state.connect_to_server(addr);
            let is_real_server = !addr.to_lowercase().contains("loopback");

            if is_real_server {
                self.prepare_match_hero_tracking(state);
            }

            if is_real_server
                && matches!(
                    state.phase,
                    GamePhase::MainMenu
                        | GamePhase::Hideout
                        | GamePhase::PartyHideout
                        | GamePhase::InQueue
                )
            {
                state.enter_match_intro();
            }

            if state.phase == GamePhase::InQueue && is_real_server {
                state.queue_start_time = None;
            }
        } else if let Some(caps) = p.loaded_hero.captures(line) {
            let is_hideout = matches!(state.phase, GamePhase::Hideout | GamePhase::PartyHideout);
            if !(is_hideout && !self.hideout_loaded) {
                self.apply_hero_signal(state, &caps[1], hero_store);
            }
        } else if let Some(caps) = p.client_hero_vmdl.captures(line) {
            let hero_norm = caps[1].to_lowercase();
            self.apply_hero_signal(state, &hero_norm, hero_store);
            if state.hero_key.as_deref() == Some("werewolf") && hero_norm == "werewolf" {
                state.is_transformed = line.to_lowercase().contains("werewolf_transform");
            }
        } else if p.silver_wolf_form_on.is_match(line) {
            state.is_transformed = true;
        } else if p.silver_wolf_form_off.is_match(line) {
            state.is_transformed = false;
        } else if let Some(caps) = p.server_disconnect.captures(line) {
            let reason_upper = caps[1].to_uppercase();
            if reason_upper.contains("EXITING") {
                self.open_hero_window();
                state.reset();
            } else if !reason_upper.contains("LOOPDEACTIVATE")
                && matches!(
                    state.phase,
                    GamePhase::InMatch | GamePhase::MatchIntro | GamePhase::Spectating
                )
            {
                state.end_match();
            }
        } else if p.loop_mode_menu.is_match(line)
            && matches!(
                state.phase,
                GamePhase::InMatch | GamePhase::MatchIntro | GamePhase::Spectating
            )
        {
            state.end_match();
        } else if let Some(caps) = p.change_game_state.captures(line) {
            if state.phase != GamePhase::Spectating && !in_hideout_map && !self.hideout_loaded {
                let state_name = caps[1].to_lowercase();
                let state_id: u32 = caps[2].parse().unwrap_or(0);
                state.game_state_id = Some(state_id);

                if state_name == "matchintro" || state_id == 4 {
                    state.enter_match_intro();
                } else if state_name == "gameinprogress"
                    || state_name == "inprogress"
                    || state_id == 7
                {
                    state.start_match(MatchMode::Unknown);
                } else if state_name == "postgame" || state_id == 6 {
                    state.end_match();
                }
            }
        } else if let Some(caps) = p.hideout_lobby_state.captures(line) {
            let lobby_id: i64 = caps[2].parse().unwrap_or(0);
            if lobby_id == 0 {
                self.clear_party_tracking(state);
            } else if lobby_id > 0 {
                self.set_party_size_from_members(state, 2);
            }
            if matches!(state.phase, GamePhase::Hideout | GamePhase::PartyHideout) {
                state.phase = if state.in_party() {
                    GamePhase::PartyHideout
                } else {
                    GamePhase::Hideout
                };
            }
        } else if p.bot_init.is_match(line) {
            if state.phase != GamePhase::Spectating && !in_hideout_map {
                self.bot_init_count += 1;
                if state.match_mode == MatchMode::Unknown {
                    state.match_mode = MatchMode::BotMatch;
                }
            }
        } else if let Some(caps) = p.host_activate.captures(line) {
            let map_name = caps[1].to_lowercase();
            if HIDEOUT_MAPS.contains(&map_name.trim()) {
                self.hideout_loaded = true;
            }
        } else if let Some(caps) = p.server_shutdown.captures(line) {
            let reason = &caps[1];
            if reason.to_uppercase().contains("EXITING") {
                self.clear_party_tracking(state);
                self.open_hero_window();
                state.reset();
            }
        } else if p.app_shutdown.is_match(line) || p.source2_shutdown.is_match(line) {
            self.clear_party_tracking(state);
            self.open_hero_window();
            state.reset();
        } else if let Some(caps) = p.player_info.captures(line) {
            if state.phase != GamePhase::Spectating {
                state.player_count = caps[1].parse().unwrap_or(0);
                state.bot_count = caps[2].parse().unwrap_or(0);

                if matches!(state.match_mode, MatchMode::Unknown | MatchMode::BotMatch) {
                    if state.player_count >= 9 {
                        state.match_mode = MatchMode::Unranked;
                    } else if state.player_count >= 5 {
                        state.match_mode = MatchMode::StreetBrawl;
                    }
                }
            }
        } else if let Some(caps) = p.precaching_heroes.captures(line) {
            let count: u32 = caps[1].parse().unwrap_or(0);
            if count > 0 {
                self.hideout_loaded = false;
            }
        }

        state.phase != old_phase
            || state.hero_key != old_hero
            || state.match_mode != old_mode
            || state.is_transformed != old_transformed
            || state.party_size != old_party
    }

    fn apply_map(&mut self, state: &mut GameState, map_name: &str) {
        if state.phase == GamePhase::Spectating {
            return;
        }
        let map_lower = map_name.to_lowercase();
        let map_trimmed = map_lower.trim();
        if map_trimmed.is_empty() || map_trimmed == "<empty>" {
            return;
        }

        state.map_name = Some(map_trimmed.to_string());

        let mapped_mode = MAP_TO_MODE.iter().find(|m| m.map == map_trimmed);

        if let Some(mapped) = mapped_mode {
            if mapped.mode != MatchMode::Unknown {
                state.match_mode = mapped.mode;
            }
        }

        if HIDEOUT_MAPS.contains(&map_trimmed) {
            state.enter_hideout();
            state.map_name = Some(map_trimmed.to_string());
            self.open_hero_window();
            self.hideout_loaded = false;
            self.bot_init_count = 0;
            return;
        }

        if let Some(mapped) = mapped_mode {
            state.start_match(mapped.mode);
            self.prepare_match_hero_tracking(state);
            self.hideout_loaded = false;
        }
    }

    fn apply_hero_signal(
        &mut self,
        state: &mut GameState,
        hero_key: &str,
        hero_store: &HeroDataStore,
    ) {
        let hero_norm = hero_store.normalize_codename(hero_key);

        if state.phase == GamePhase::Spectating {
            return;
        }

        if matches!(state.phase, GamePhase::MatchIntro | GamePhase::InMatch) {
            if state.match_mode != MatchMode::Sandbox {
                if state.hero_key.is_some() && state.hero_key.as_deref() != Some(&hero_norm) {
                    return;
                }
                if state.hero_key.is_none() && !self.hero_window_open {
                    return;
                }
            }
        } else if matches!(state.phase, GamePhase::MainMenu | GamePhase::PostMatch) {
            return;
        }

        state.set_hero(&hero_norm);
        if matches!(state.phase, GamePhase::MatchIntro | GamePhase::InMatch)
            && state.match_mode != MatchMode::Sandbox
        {
            self.close_hero_window();
        }
    }

    fn apply_party_event(
        &mut self,
        state: &mut GameState,
        party_id: u64,
        event_name: &str,
        account_id: u64,
    ) {
        let event_lower = event_name.to_lowercase();

        if event_lower.contains("joinedparty") {
            if Some(account_id) == self.local_account_id {
                self.party_id = Some(party_id);
                self.party_members.clear();
                self.party_members.insert(account_id);
            } else if self.party_id != Some(party_id) {
                self.party_id = Some(party_id);
                self.party_members.clear();
                if let Some(local_id) = self.local_account_id {
                    self.party_members.insert(local_id);
                }
            }
            self.party_members.insert(account_id);
            self.set_party_size_from_members(state, 2);
            return;
        }

        if self.party_id != Some(party_id) {
            return;
        }

        if event_lower.contains("leftparty")
            || event_lower.contains("removedfromparty")
            || event_lower.contains("kickedfromparty")
        {
            if Some(account_id) == self.local_account_id {
                self.clear_party_tracking(state);
            } else {
                self.party_members.remove(&account_id);
                self.set_party_size_from_members(state, 1);
            }
        } else if event_lower.contains("disband") {
            self.clear_party_tracking(state);
        }
    }

    fn set_party_size_from_members(&self, state: &mut GameState, minimum: u32) {
        let mut members = self.party_members.clone();
        if let Some(local_id) = self.local_account_id {
            members.insert(local_id);
        }
        state.set_party_size(minimum.max(members.len() as u32));
    }

    fn clear_party_tracking(&mut self, state: &mut GameState) {
        self.party_id = None;
        self.party_members.clear();
        state.set_party_size(1);
    }

    fn prepare_match_hero_tracking(&mut self, state: &mut GameState) {
        state.hero_key = None;
        state.is_transformed = false;
        self.hero_window_open = true;
    }

    fn open_hero_window(&mut self) {
        self.hero_window_open = true;
    }

    fn close_hero_window(&mut self) {
        self.hero_window_open = false;
    }

    pub fn reset_tracking(&mut self) {
        self.hero_window_open = true;
        self.hideout_loaded = false;
        self.bot_init_count = 0;
        self.local_account_id = None;
        self.party_id = None;
        self.party_members.clear();
    }
}

impl Default for LogParser {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::LogParser;
    use crate::hero_data::HeroDataStore;
    use crate::state::{GamePhase, GameState, MatchMode};
    use std::path::Path;

    #[test]
    fn normalizes_variant_hero_signals_from_vmdl_lines() {
        let hero_store = HeroDataStore::new(Path::new("."));
        let mut parser = LogParser::new();
        let mut state = GameState::new();
        state.phase = GamePhase::InMatch;
        state.match_mode = MatchMode::Sandbox;

        let changed = parser.process_line(
            "[Client] VMDL Camera Pose Success! models/heroes/mirage_v2/model.vmdl",
            &mut state,
            &hero_store,
        );

        assert!(changed);
        assert_eq!(state.hero_key.as_deref(), Some("mirage"));
    }

    #[test]
    fn matches_log_patterns_case_insensitively() {
        let hero_store = HeroDataStore::new(Path::new("."));
        let mut parser = LogParser::new();
        let mut state = GameState::new();
        state.phase = GamePhase::InMatch;
        state.match_mode = MatchMode::Sandbox;

        parser.process_line(
            "[client] vmdl camera pose success! models/heroes/gigawatt_prisoner/model.vmdl",
            &mut state,
            &hero_store,
        );

        assert_eq!(state.hero_key.as_deref(), Some("gigawatt"));
    }

    #[test]
    fn moves_from_hideout_to_queue_on_matchmaking_start() {
        let hero_store = HeroDataStore::new(Path::new("."));
        let mut parser = LogParser::new();
        let mut state = GameState::new();
        state.enter_hideout();

        parser.process_line(
            "[GCClient] Send msg 9010 (k_EMsgClientToGCStartMatchmaking)",
            &mut state,
            &hero_store,
        );

        assert_eq!(state.phase, GamePhase::InQueue);
    }
}
