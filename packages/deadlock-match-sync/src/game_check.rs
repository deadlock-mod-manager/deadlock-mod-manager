//! While Deadlock is running, Steam routes GC traffic to the game's own pipe;
//! a second process's GC session gets nothing. Every fetch path
//! must refuse while the game is running, not just detect it opportunistically.

pub trait GameRunningCheck: Send + Sync {
  fn is_game_running(&self) -> bool;
}
