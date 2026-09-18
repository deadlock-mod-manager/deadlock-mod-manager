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

const MAX_PARTY_SIZE: u32 = 6;
// A Street Brawl lobby holds 8 players, so anything above that is a 6v6 lobby.
const STREET_BRAWL_MAX_PLAYERS: u32 = 8;
const STREET_BRAWL_MIN_PLAYERS: u32 = 5;
// Matchmade dedicated servers always report one bot ("Players: 7 (1 bots)"), so only
// more than that means the match is actually played against bots.
const MATCHMADE_SERVER_BOTS: u32 = 1;
const STEAM_ID64_BASE: u64 = 76_561_197_960_265_728;

// EGameState from client.dll: Invalid, Init, WaitingForPlayersToJoin, HeroSelection,
// MatchIntro, WaitForMapToLoad, PreGameWait, GameInProgress, PostGame,
// PostGame_PlayOfTheGame, Abandoned, End.
const GAME_STATE_MATCH_INTRO: u32 = 4;
const GAME_STATE_IN_PROGRESS: u32 = 7;
const GAME_STATE_POST_GAME: u32 = 8;
const GAME_STATE_END: u32 = 11;

// Hideout Lobby Connection State values; the number is a state, not a lobby id.
const HIDEOUT_LOBBY_NO_LOBBY: i64 = 0;

pub struct LogParser {
    hero_window_open: bool,
    hideout_loaded: bool,
    bot_init_count: u32,
    local_account_id: Option<u64>,
    party_id: Option<u64>,
    // Other members named by party events; the local player is always counted separately.
    party_members: HashSet<u64>,
    // Members the hideout headcount proves exist but no party event named, e.g. everyone
    // who was already in a party before the local player joined it.
    party_unnamed_members: u32,
    match_peak_players: u32,
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
            party_unnamed_members: 0,
            match_peak_players: 0,
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

        if let Some(caps) = p.local_steam_id.captures(line)
            && let Ok(steam_id) = caps[1].parse::<u64>()
            && let Some(id) = steam_id.checked_sub(STEAM_ID64_BASE)
        {
            self.set_local_account_id(state, id);
        } else if self.local_account_id.is_none()
            && let Some(caps) = p.local_account_id.captures(line)
            && let Ok(id) = caps[1].parse::<u64>()
        {
            self.set_local_account_id(state, id);
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
                self.begin_match(state);
            }
        } else if p.lobby_destroyed.is_match(line) {
            state.end_match();
        } else if p.spectate_broadcast.is_match(line) {
            state.enter_spectating();
            self.hideout_loaded = false;
        } else if let Some(caps) = p.server_connect.captures(line) {
            let addr = &caps[1];
            state.connect_to_server(addr);
            let addr_lower = addr.to_lowercase();
            // The local hideout server is reached over loopback or 127.0.0.1.
            let is_real_server =
                !addr_lower.contains("loopback") && !addr_lower.starts_with("127.0.0.1");

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
                self.begin_match(state);
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

                if state_name == "matchintro" || state_id == GAME_STATE_MATCH_INTRO {
                    state.enter_match_intro();
                } else if state_name == "gameinprogress" || state_id == GAME_STATE_IN_PROGRESS {
                    state.start_match(MatchMode::Unknown);
                } else if state_name.starts_with("postgame")
                    || (GAME_STATE_POST_GAME..=GAME_STATE_END).contains(&state_id)
                {
                    state.end_match();
                }
            }
        } else if let Some(caps) = p.hideout_lobby_state.captures(line) {
            // The hideout lobby is dropped when a match starts, so only trust NoLobby
            // as "solo" while the player is actually in the hideout.
            let connection_state: i64 = caps[2].parse().unwrap_or(-1);
            if connection_state == HIDEOUT_LOBBY_NO_LOBBY
                && matches!(state.phase, GamePhase::Hideout | GamePhase::PartyHideout)
            {
                self.clear_party_tracking(state);
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
            let players: u32 = caps[1].parse().unwrap_or(0);
            let bots: u32 = caps[2].parse().unwrap_or(0);
            // Bots are reported separately and not included in the player count, e.g. a
            // party of two in the hideout logs "Players: 2 (3 bots)".
            let humans = players;
            log::debug!(
                "[GamePresence] Server info: players={players} bots={bots} max={} map={current_map} phase={:?}",
                &caps[3],
                state.phase
            );

            if in_hideout_map {
                // Only party members can enter the shared hideout, so its headcount is
                // the party size, including members who joined before we did.
                if humans > 0 {
                    self.apply_hideout_headcount(state, humans);
                }
            } else if matches!(state.phase, GamePhase::MatchIntro | GamePhase::InMatch) {
                state.player_count = players;
                state.bot_count = bots;
                self.apply_match_player_count(state, players, bots);
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

        if HIDEOUT_MAPS.contains(&map_trimmed) {
            state.enter_hideout();
            state.map_name = Some(map_trimmed.to_string());
            self.open_hero_window();
            self.hideout_loaded = false;
            self.bot_init_count = 0;
            return;
        }

        if let Some(mapped) = mapped_mode {
            if !matches!(state.phase, GamePhase::MatchIntro | GamePhase::InMatch) {
                self.begin_match(state);
            }
            // The map only names the mode for maps that host a single mode; otherwise
            // keep whatever the player count already inferred.
            if state.match_mode == MatchMode::Unknown {
                state.match_mode = mapped.mode;
            }
            state.start_match(MatchMode::Unknown);
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
                // The GC never announces members who were in the party before us, so
                // assume at least one until the hideout headcount says how many.
                self.party_id = Some(party_id);
                self.party_members.clear();
                self.party_unnamed_members = 1;
            } else {
                if self.party_id != Some(party_id) {
                    self.party_id = Some(party_id);
                    self.party_members.clear();
                    self.party_unnamed_members = 0;
                }
                self.party_members.insert(account_id);
            }
            self.update_party_size(state);
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
                // A member no event named must be one of the unnamed ones.
                if !self.party_members.remove(&account_id) {
                    self.party_unnamed_members = self.party_unnamed_members.saturating_sub(1);
                }
                self.update_party_size(state);
            }
        } else if event_lower.contains("disband") {
            self.clear_party_tracking(state);
        }
    }

    fn set_local_account_id(&mut self, state: &mut GameState, id: u64) {
        if self.local_account_id == Some(id) {
            return;
        }
        self.local_account_id = Some(id);
        // An event may have named us before we knew our own id.
        if self.party_members.remove(&id) {
            self.update_party_size(state);
        }
    }

    fn named_party_size(&self) -> u32 {
        // The local player plus every other member a party event named.
        1 + self.party_members.len() as u32
    }

    fn update_party_size(&self, state: &mut GameState) {
        let size = self.named_party_size() + self.party_unnamed_members;
        state.set_party_size(size.min(MAX_PARTY_SIZE));
    }

    fn apply_hideout_headcount(&mut self, state: &mut GameState, humans: u32) {
        let headcount = humans.min(MAX_PARTY_SIZE);
        self.party_unnamed_members = headcount.saturating_sub(self.named_party_size());
        self.update_party_size(state);
    }

    fn clear_party_tracking(&mut self, state: &mut GameState) {
        self.party_id = None;
        self.party_members.clear();
        self.party_unnamed_members = 0;
        state.set_party_size(1);
    }

    fn begin_match(&mut self, state: &mut GameState) {
        // Modes are per match; a mode inferred for the previous match must not leak.
        state.match_mode = MatchMode::Unknown;
        state.player_count = 0;
        state.bot_count = 0;
        self.match_peak_players = 0;
        self.bot_init_count = 0;
        state.enter_match_intro();
    }

    fn apply_match_player_count(&mut self, state: &mut GameState, players: u32, bots: u32) {
        // The count is a snapshot taken when we connect, while others may still be
        // loading in, so only the highest count seen is meaningful.
        self.match_peak_players = self.match_peak_players.max(players);
        let peak = self.match_peak_players;

        match state.match_mode {
            MatchMode::Unknown if bots > MATCHMADE_SERVER_BOTS => {
                state.match_mode = MatchMode::BotMatch;
            }
            MatchMode::Unknown | MatchMode::StreetBrawl if peak > STREET_BRAWL_MAX_PLAYERS => {
                state.match_mode = MatchMode::Unranked;
            }
            MatchMode::Unknown if peak >= STREET_BRAWL_MIN_PLAYERS => {
                state.match_mode = MatchMode::StreetBrawl;
            }
            _ => {}
        }
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
        self.party_unnamed_members = 0;
        self.match_peak_players = 0;
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

    fn feed(parser: &mut LogParser, state: &mut GameState, lines: &[&str]) {
        let hero_store = HeroDataStore::new(Path::new("."));
        for line in lines {
            parser.process_line(line, state, &hero_store);
        }
    }

    const LOCAL_AUTH: &str = "09/16 23:08:09 [SteamNetSockets] AuthStatus (steamid:76561198371579856):  Attempting  (Requesting cert)";
    const LOCAL_ID: u64 = 411_314_128;

    fn enter_hideout(parser: &mut LogParser, state: &mut GameState, humans: u32) {
        let players = format!("[Client] Players: {humans} (0 bots) / 31 humans");
        feed(
            parser,
            state,
            &[
                "[Client] CL:  Connected to '=[A:1:123:4567]'",
                "[Client] Map: \"dl_hideout\"",
                &players,
            ],
        );
    }

    fn start_online_match(parser: &mut LogParser, state: &mut GameState, players: u32) {
        let players = format!("[Client] Players: {players} (0 bots) / 31 humans");
        feed(
            parser,
            state,
            &[
                "Lobby 101893467646487792 for Match 81374442 created",
                "[Client] CL:  Connected to '=[A:1:987:6543]'",
                "[Client] Map: \"dl_midtown\"",
                &players,
            ],
        );
    }

    #[test]
    fn reads_local_account_id_from_steam_auth_status() {
        let mut parser = LogParser::new();
        let mut state = GameState::new();
        feed(&mut parser, &mut state, &[LOCAL_AUTH]);

        assert_eq!(parser.local_account_id, Some(LOCAL_ID));
    }

    #[test]
    fn hideout_connection_states_do_not_invent_a_party() {
        let mut parser = LogParser::new();
        let mut state = GameState::new();
        enter_hideout(&mut parser, &mut state, 1);
        feed(
            &mut parser,
            &mut state,
            &[
                "[Hideout] Hideout Lobby Connection State: NoServer (1)",
                "[Hideout] Hideout Lobby Connection State: Connected (5)",
            ],
        );

        assert_eq!(state.party_size, 1);
        assert_eq!(state.phase, GamePhase::Hideout);
    }

    #[test]
    fn counts_members_who_were_in_the_party_before_us() {
        let mut parser = LogParser::new();
        let mut state = GameState::new();
        feed(
            &mut parser,
            &mut state,
            &[
                LOCAL_AUTH,
                "CMsgGCToClientPartyEvent: { party_id: 555 event: k_eJoinedParty initiator_account_id: 411314128 }",
            ],
        );
        assert_eq!(state.party_size, 2);

        enter_hideout(&mut parser, &mut state, 4);
        assert_eq!(state.party_size, 4);
        assert_eq!(state.phase, GamePhase::PartyHideout);

        feed(
            &mut parser,
            &mut state,
            &[
                "CMsgGCToClientPartyEvent: { party_id: 555 event: k_eJoinedParty initiator_account_id: 42 }",
                "CMsgGCToClientPartyEvent: { party_id: 555 event: k_eLeftParty initiator_account_id: 77 }",
            ],
        );
        assert_eq!(state.party_size, 4);
    }

    #[test]
    fn keeps_party_size_when_hideout_lobby_drops_for_a_match() {
        let mut parser = LogParser::new();
        let mut state = GameState::new();
        feed(&mut parser, &mut state, &[LOCAL_AUTH]);
        enter_hideout(&mut parser, &mut state, 3);
        start_online_match(&mut parser, &mut state, 12);
        feed(
            &mut parser,
            &mut state,
            &["[Hideout] Hideout Lobby Connection State: NoLobby (0)"],
        );

        assert_eq!(state.party_size, 3);
    }

    #[test]
    fn large_party_hideout_is_not_mistaken_for_street_brawl() {
        let mut parser = LogParser::new();
        let mut state = GameState::new();
        enter_hideout(&mut parser, &mut state, 6);
        feed(
            &mut parser,
            &mut state,
            &["[GCClient] Send msg 9010 (k_EMsgClientToGCStartMatchmaking), 201 bytes"],
        );
        start_online_match(&mut parser, &mut state, 12);

        assert_eq!(state.match_mode, MatchMode::Unranked);
    }

    #[test]
    fn upgrades_early_street_brawl_guess_when_more_players_show_up() {
        let mut parser = LogParser::new();
        let mut state = GameState::new();
        enter_hideout(&mut parser, &mut state, 1);
        start_online_match(&mut parser, &mut state, 7);
        assert_eq!(state.match_mode, MatchMode::StreetBrawl);

        feed(
            &mut parser,
            &mut state,
            &["[Client] Players: 12 (0 bots) / 31 humans"],
        );
        assert_eq!(state.match_mode, MatchMode::Unranked);

        feed(
            &mut parser,
            &mut state,
            &["[Client] Players: 8 (0 bots) / 31 humans"],
        );
        assert_eq!(state.match_mode, MatchMode::Unranked);
    }

    #[test]
    fn matchmade_street_brawl_with_server_bot_is_not_a_bot_match() {
        let mut parser = LogParser::new();
        let mut state = GameState::new();
        feed(
            &mut parser,
            &mut state,
            &[
                "[Client] CL:  Connected to '=[A:1:3958069254:51454]'",
                "[Client] Map: \"dl_hideout\"",
                "[Client] Players: 2 (3 bots) / 32 humans",
            ],
        );
        assert_eq!(state.party_size, 2);
        assert_eq!(state.phase, GamePhase::PartyHideout);

        feed(
            &mut parser,
            &mut state,
            &[
                "Lobby 174141136703762847 for Match 106401183 created",
                "[Client] CL:  Connected to '=[A:1:4084361237:51454]'",
                "[Client] Map: \"start\"",
                "[Client] Players: 7 (1 bots) / 32 humans",
            ],
        );

        assert_eq!(state.match_mode, MatchMode::StreetBrawl);
        assert_eq!(state.party_size, 2);
    }

    #[test]
    fn match_mode_does_not_leak_into_the_next_match() {
        let mut parser = LogParser::new();
        let mut state = GameState::new();
        enter_hideout(&mut parser, &mut state, 1);
        start_online_match(&mut parser, &mut state, 8);
        assert_eq!(state.match_mode, MatchMode::StreetBrawl);

        feed(
            &mut parser,
            &mut state,
            &["Lobby 101893467646487792 for Match 81374442 destroyed"],
        );
        start_online_match(&mut parser, &mut state, 12);

        assert_eq!(state.match_mode, MatchMode::Unranked);
    }

    #[test]
    fn pre_game_wait_does_not_end_the_match() {
        let mut parser = LogParser::new();
        let mut state = GameState::new();
        start_online_match(&mut parser, &mut state, 12);
        feed(
            &mut parser,
            &mut state,
            &["OnGameStateChanged: PreGameWait (6)"],
        );
        assert_eq!(state.phase, GamePhase::InMatch);

        feed(
            &mut parser,
            &mut state,
            &["OnGameStateChanged: PostGame (8)"],
        );
        assert_eq!(state.phase, GamePhase::PostMatch);
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
