// deadlock-api expects the 32-bit Steam3 account id, not the SteamID64.
pub fn account_id_of(steam_id64: u64) -> u32 {
  (steam_id64 & 0xFFFF_FFFF) as u32
}

// Bits 52..56 hold the account type; 1 is an individual user (not a group, server, ...).
pub fn is_individual(steam_id64: u64) -> bool {
  (steam_id64 >> 52) & 0xF == 1
}
