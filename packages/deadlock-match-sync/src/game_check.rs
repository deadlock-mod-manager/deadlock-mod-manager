pub trait GameRunningCheck: Send + Sync {
  fn is_game_running(&self) -> bool;
}
