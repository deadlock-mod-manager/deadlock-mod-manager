pub fn account_id_of(steam_id64: u64) -> u32 {
  (steam_id64 & 0xFFFF_FFFF) as u32
}

pub fn is_individual(steam_id64: u64) -> bool {
  (steam_id64 >> 52) & 0xF == 1
}
