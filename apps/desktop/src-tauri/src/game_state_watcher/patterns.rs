use regex::Regex;
use std::sync::LazyLock;

pub struct Patterns {
  pub change_game_state: Regex,
  pub hideout_lobby_state: Regex,
  pub party_event: Regex,
  pub local_account_id: Regex,
  pub server_connect: Regex,
  pub server_disconnect: Regex,
  pub server_shutdown: Regex,
  pub map_created_physics: Regex,
  pub silver_wolf_form_on: Regex,
  pub silver_wolf_form_off: Regex,
  pub mm_start: Regex,
  pub mm_stop: Regex,
  pub host_activate: Regex,
  pub loaded_hero: Regex,
  pub client_hero_vmdl: Regex,
  pub bot_init: Regex,
  pub player_info: Regex,
  pub map_info: Regex,
  pub app_shutdown: Regex,
  pub source2_shutdown: Regex,
  pub precaching_heroes: Regex,
  pub loop_mode_menu: Regex,
  pub lobby_created: Regex,
  pub lobby_destroyed: Regex,
  pub spectate_broadcast: Regex,
}

pub static PATTERNS: LazyLock<Patterns> = LazyLock::new(|| Patterns {
  change_game_state: re(r"ChangeGameState:\s+(\w+)\s+\((\d+)\)"),
  hideout_lobby_state: re(r"\[Hideout\] Hideout Lobby Connection State:\s+(\w+)\s+\((-?\d+)\)"),
  party_event: re(
    r"CMsgGCToClientPartyEvent:\s+\{\s*party_id:\s+(\d+)\s+event:\s+(k_e\w+)\s+initiator_account_id:\s+(\d+)\s*\}",
  ),
  local_account_id: re(r"\[U:1:(\d+)\]"),
  server_connect: re(r"\[Client\] CL:\s+Connected to '([^']+)'"),
  server_disconnect: re(r"\[Client\] Disconnecting from server:\s+(\S+)"),
  server_shutdown: re(r"\[Server\] SV:\s+Server shutting down:\s+(\S+)"),
  map_created_physics: re(r"\[Client\] Created physics for\s+([^\s]+)"),
  silver_wolf_form_on: re(r"werewolf_transform\.vmdl"),
  silver_wolf_form_off: re(r"werewolf\.vmdl"),
  mm_start: re(r"\[GCClient\] Send msg 9010 \(k_EMsgClientToGCStartMatchmaking\)"),
  mm_stop: re(r"\[GCClient\] Send msg 9012 \(k_EMsgClientToGCStopMatchmaking\)"),
  host_activate: re(r"\[HostStateManager\] Host activate:.*\(([^)]+)\)"),
  loaded_hero: re(r"\[Server\] Loaded hero \d+/(hero_\w+)"),
  client_hero_vmdl: re(r"VMDL Camera Pose Success!.*models/heroes(?:_wip|_staging)?/(\w+)/"),
  bot_init: re(r"Initializing bot for player slot \d+:\s+(k_ECitadelBotDifficulty_\w+)"),
  player_info: re(r"\[Client\] Players:\s+(\d+)\s+\((\d+) bots\)\s+/\s+(\d+) humans"),
  map_info: re(r#"\[Client\] Map:\s+"([^"]+)""#),
  app_shutdown: re(r"Dispatching EventAppShutdown_t"),
  source2_shutdown: re(r"Source2Shutdown"),
  precaching_heroes: re(r"Precaching (\d+) heroes in CCitadelGameRules"),
  loop_mode_menu: re(r"LoopMode:\s*menu"),
  lobby_created: re(r"Lobby\s+\d+\s+for\s+Match\s+\d+\s+created"),
  lobby_destroyed: re(r"Lobby\s+\d+\s+for\s+Match\s+\d+\s+destroyed"),
  spectate_broadcast: re(r"Playing Broadcast"),
});

fn re(pattern: &str) -> Regex {
  Regex::new(pattern).expect("invalid regex pattern in game_state_watcher")
}
