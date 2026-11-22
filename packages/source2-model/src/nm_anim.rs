//! Deadlock "NM" (new animation) graph clips: parse the compressed clip data,
//! resolve a clip for an ability via the anim-graph, and sample bone poses.

mod parse;
mod preview;
mod retarget;
mod sample;
mod sequence;
mod types;

pub use parse::*;
pub use preview::*;
pub use retarget::*;
pub(crate) use sample::{source_quat_to_gltf, source_vec3_to_gltf};
pub use sequence::*;
pub use types::*;

use std::collections::BTreeSet;

use crate::kv3::KvValue;
use crate::resource::Resource;
use crate::vpk_extract::VpkArchive;

/// Every clip a model can play: whatever its anim graphs reference, nested
/// graphs included, plus clips in `clips/` or `clip/` beside the model among
/// `listing` (the entries of the archive and its fallbacks).
///
/// Graphs are the source of truth: a skin can ship its model in another
/// folder than the base hero's, heroes share graphs (Viscous plays Kelvin's),
/// and some keep their clips in `clip/`.
pub fn model_clip_paths(archive: &VpkArchive, entry_path: &str, listing: &[String]) -> Vec<String> {
    let kv = |path: &str| {
        let bytes = archive.extract_entry(path).ok()?;
        parse::parse_data(&Resource::parse(bytes).ok()?).ok()
    };
    let normalized = entry_path.replace('\\', "/").to_ascii_lowercase();
    let mut queue: Vec<String> = kv(&normalized)
        .map(|data| {
            data.get("m_animGraph2Refs")
                .and_then(KvValue::as_array)
                .unwrap_or(&[])
                .iter()
                .filter_map(|graph| graph.get("m_hGraph").and_then(KvValue::as_string))
                .map(parse::compiled_resource_path)
                .collect()
        })
        .unwrap_or_default();
    let mut clips = BTreeSet::new();
    let mut visited = BTreeSet::new();
    while let Some(graph) = queue.pop() {
        if !visited.insert(graph.clone()) {
            continue;
        }
        let Some(data) = kv(&graph) else { continue };
        for resource in data
            .get("m_resources")
            .and_then(KvValue::as_array)
            .unwrap_or(&[])
            .iter()
            .filter_map(KvValue::as_string)
        {
            let path = parse::compiled_resource_path(resource);
            if path.ends_with(".vnmclip_c") {
                clips.insert(path);
            } else if path.ends_with(".vnmgraph_c") {
                queue.push(path);
            }
        }
    }
    if let Some((directory, _)) = normalized.rsplit_once('/') {
        let prefixes = [format!("{directory}/clips/"), format!("{directory}/clip/")];
        clips.extend(
            listing
                .iter()
                .filter(|path| {
                    path.ends_with(".vnmclip_c")
                        && prefixes.iter().any(|prefix| path.starts_with(prefix))
                })
                .cloned(),
        );
    }
    clips.into_iter().collect()
}
