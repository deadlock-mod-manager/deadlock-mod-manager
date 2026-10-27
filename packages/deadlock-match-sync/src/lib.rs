//! Match sync: recovers the salts of Deadlock matches through the user's own Steam
//! account and posts them to deadlock-api. Free of any app framework; the host app
//! supplies persistence, the game check, Steam's install directory and an HTTP client.

pub mod api_client;
pub mod auth;
pub mod error;
pub mod friends;
pub mod game_check;
pub mod gc_client;
pub mod model;
pub mod quota;
mod steam_id;
pub mod sync;
pub mod throttle;
