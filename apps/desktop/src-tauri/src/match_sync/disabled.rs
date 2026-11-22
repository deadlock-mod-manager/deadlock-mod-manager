//! What the rest of the app calls into match sync, for builds without the `match-sync`
//! feature: no session to release on game launch, no pass to run on game exit.

use crate::app_runtime::AppHandle;

pub fn on_game_exit(_app: AppHandle) {}

pub async fn release_for_game_launch() {}
