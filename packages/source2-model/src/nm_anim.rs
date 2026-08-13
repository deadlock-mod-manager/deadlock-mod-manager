//! Deadlock "NM" (new animation) graph clips: parse the compressed clip data,
//! resolve a clip for an ability via the anim-graph, and sample bone poses.

mod parse;
mod retarget;
mod sample;
mod sequence;
mod types;

pub use parse::*;
pub use retarget::*;
pub use sequence::*;
pub use types::*;
