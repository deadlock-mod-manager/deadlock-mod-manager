//! Gathers what a preview needs to play a model's particle effects: which
//! particle systems the model shows in previews, the attachment points they
//! bind to, each system's definition (with its children), and its textures.
//!
//! Definitions stay as decoded KV3 converted to JSON; the renderer interprets
//! the operators it supports and skips the rest.

use std::collections::BTreeSet;

use crate::kv3::{self, KvValue};
use crate::nm_anim::{source_quat_to_gltf, source_vec3_to_gltf};
use crate::vpk_extract::VpkArchive;
use crate::vtex::{SpriteSheetSequence, VtexHeader};
use crate::{Resource, Result, Source2Error};

// Root depth is zero; six child edges are allowed.
const MAX_DEPTH: usize = 6;
const MAX_SYSTEMS: usize = 48;
const MAX_DIAGNOSTICS: usize = 96;
const MAX_SIBLING_MODELS: usize = 32;
const MAX_MODEL_ENTRY_BYTES: usize = 64 * 1024 * 1024;
const MAX_DISCOVERY_BYTES: usize = 128 * 1024 * 1024;
const MAX_SYSTEM_ENTRY_BYTES: usize = 2 * 1024 * 1024;
const MAX_SYSTEM_BYTES: usize = 16 * 1024 * 1024;
const MAX_TEXTURE_ENTRY_BYTES: usize = 64 * 1024 * 1024;

// Charge extracted bytes before parsing, so invalid resources consume budget too.
fn extract_budgeted(
    archive: &VpkArchive,
    path: &str,
    max_entry_bytes: usize,
    remaining_bytes: &mut usize,
) -> Result<Vec<u8>> {
    if *remaining_bytes == 0 {
        return Err(Source2Error::Resource(format!(
            "aggregate preview byte limit exhausted: {path}"
        )));
    }
    let bytes = archive.extract_entry_limited(path, max_entry_bytes.min(*remaining_bytes))?;
    *remaining_bytes -= bytes.len();
    Ok(bytes)
}

/// A named point on the model that particles bind their control points to.
#[derive(Debug, Clone)]
pub struct ModelAttachment {
    pub name: String,
    pub bone: String,
    /// Offset and rotation in the bone's local frame, in glTF axes.
    pub offset: [f32; 3],
    pub rotation: [f32; 4],
}

#[derive(Debug, Clone)]
pub struct ParticleSystemFile {
    pub path: String,
    pub definition: serde_json::Value,
    pub children: Vec<ParticleSystemFile>,
}

#[derive(Debug, Clone)]
pub struct ParticleTexture {
    pub width: u32,
    pub height: u32,
    pub png: Vec<u8>,
    pub sequences: Vec<SpriteSheetSequence>,
}

fn compiled(path: &str) -> String {
    if path.ends_with("_c") {
        path.to_string()
    } else {
        format!("{path}_c")
    }
}

/// The preview and ambient `.vpcf` systems explicitly declared by a model.
pub fn model_preview_particles(resource: &Resource) -> Result<Vec<String>> {
    let Some(data) = resource.block_bytes("DATA") else {
        return Ok(Vec::new());
    };
    let data = kv3::parse(data)?;
    let text = data
        .get("m_modelInfo")
        .and_then(|info| info.get("m_keyValueText"))
        .and_then(KvValue::as_string)
        .unwrap_or("");
    Ok(preview_paths_in_key_values(text))
}

#[derive(Debug, PartialEq)]
enum KeyToken {
    Word(String),
    Quoted(String),
    Symbol(char),
}

// Only tokenize the metadata fields we need; brackets inside quotes/comments
// must not terminate the particle list, which can itself contain nested arrays.
fn key_tokens(text: &str) -> Vec<KeyToken> {
    let mut chars = text.chars().peekable();
    let mut tokens = Vec::new();
    while let Some(ch) = chars.next() {
        if ch.is_whitespace() {
            continue;
        }
        if ch == '/' && chars.peek() == Some(&'/') {
            for ch in chars.by_ref() {
                if ch == '\n' {
                    break;
                }
            }
        } else if ch == '/' && chars.peek() == Some(&'*') {
            chars.next();
            while let Some(ch) = chars.next() {
                if ch == '*' && chars.peek() == Some(&'/') {
                    chars.next();
                    break;
                }
            }
        } else if ch == '"' {
            let mut value = String::new();
            while let Some(ch) = chars.next() {
                if ch == '"' {
                    break;
                }
                if ch == '\\' {
                    if let Some(escaped) = chars.next() {
                        value.push(escaped);
                    }
                } else {
                    value.push(ch);
                }
            }
            tokens.push(KeyToken::Quoted(value));
        } else if "[]=,:{}".contains(ch) {
            tokens.push(KeyToken::Symbol(ch));
        } else {
            let mut word = String::from(ch);
            while let Some(ch) = chars.peek() {
                if ch.is_whitespace() || "[]=,:{}\"".contains(*ch) {
                    break;
                }
                word.push(*ch);
                chars.next();
            }
            tokens.push(KeyToken::Word(word));
        }
    }
    tokens
}

fn preview_paths_in_key_values(text: &str) -> Vec<String> {
    let tokens = key_tokens(text);
    let mut paths = Vec::new();
    for (index, token) in tokens.iter().enumerate() {
        let KeyToken::Word(key) = token else {
            continue;
        };
        if !matches!(
            key.as_str(),
            "particle_cfg_list" | "m_hAmbientParticle" | "m_vecAmbientParticleSettings"
        ) || tokens.get(index + 1) != Some(&KeyToken::Symbol('='))
        {
            continue;
        }
        let mut depth = 0usize;
        for token in tokens.iter().skip(index + 2) {
            match token {
                KeyToken::Symbol('[' | '{') => depth += 1,
                KeyToken::Symbol(']' | '}') => {
                    depth = depth.saturating_sub(1);
                    if depth == 0 {
                        break;
                    }
                }
                KeyToken::Quoted(path) => {
                    let path = path.trim_end_matches("_c");
                    if path.ends_with(".vpcf") && !paths.iter().any(|item| item == path) {
                        paths.push(path.to_string());
                    }
                    if depth == 0 {
                        break;
                    }
                }
                _ => {}
            }
        }
    }
    paths
}

/// Some mods ship a rebuilt game model with its preview metadata stripped,
/// alongside the original model. Reuse that metadata only when both compile
/// from exactly the same mesh source (filename AND CRC), within the same folder.
/// Checks at most 32 siblings, extracting at most 64 MiB per entry and 128 MiB
/// in total. Oversized, unreadable, and invalid siblings are skipped.
/// Returns the model paths that supplied the discovered effects for diagnostics.
pub fn discover_model_preview_particles(
    archive: &VpkArchive,
    resource: &Resource,
    entry_path: &str,
) -> Result<ModelParticleDiscovery> {
    let paths = model_preview_particles(resource)?;
    if !paths.is_empty() {
        return Ok(ModelParticleDiscovery {
            paths,
            source_models: vec![entry_path.to_string()],
        });
    }
    let inputs = mesh_inputs(resource);
    let signature = geometry_signature(resource);
    let mut found = ModelParticleDiscovery::default();
    if inputs.is_empty() || signature.is_none() {
        return Ok(found);
    }
    let directory = entry_path
        .rsplit_once('/')
        .map(|(dir, _)| dir)
        .unwrap_or("");
    let mut candidates: Vec<_> = archive
        .list_entries()
        .into_iter()
        .filter(|path| {
            path != entry_path
                && path.ends_with(".vmdl_c")
                && path.rsplit_once('/').map(|(dir, _)| dir).unwrap_or("") == directory
        })
        .collect();
    candidates.sort();
    let mut remaining_bytes = MAX_DISCOVERY_BYTES;
    for path in candidates.into_iter().take(MAX_SIBLING_MODELS) {
        if remaining_bytes == 0 {
            break;
        }
        let Ok(model) =
            extract_budgeted(archive, &path, MAX_MODEL_ENTRY_BYTES, &mut remaining_bytes)
                .and_then(Resource::parse)
        else {
            continue;
        };
        if geometry_signature(&model) != signature || mesh_inputs(&model).is_disjoint(&inputs) {
            continue;
        }
        let Ok(paths) = model_preview_particles(&model) else {
            continue;
        };
        if paths.is_empty() {
            continue;
        }
        found.source_models.push(path);
        for path in paths {
            if !found.paths.contains(&path) {
                found.paths.push(path);
            }
        }
    }
    Ok(found)
}

#[derive(Debug, Default)]
pub struct ModelParticleDiscovery {
    pub paths: Vec<String>,
    pub source_models: Vec<String>,
}

fn geometry_signature(resource: &Resource) -> Option<(u32, u32, u32)> {
    let data = kv3::parse(resource.block_bytes("RED2")?).ok()?;
    let info = data.get("m_SearchableUserData")?;
    let vertices = info.get("model_lod0_vertex_count")?.as_u32()?;
    let triangles = info.get("model_lod0_triangle_count")?.as_u32()?;
    let bones = info.get("model_bone_count")?.as_u32()?;
    (vertices > 0 && triangles > 0 && bones > 0).then_some((vertices, triangles, bones))
}

fn mesh_inputs(resource: &Resource) -> BTreeSet<(String, u32)> {
    let Some(data) = resource
        .block_bytes("RED2")
        .and_then(|data| kv3::parse(data).ok())
    else {
        return BTreeSet::new();
    };
    data.get("m_InputDependencies")
        .and_then(KvValue::as_array)
        .unwrap_or(&[])
        .iter()
        .filter_map(|item| {
            let path = item.get("m_RelativeFilename")?.as_string()?;
            if !path.ends_with(".dmx") && !path.ends_with(".fbx") {
                return None;
            }
            let crc = item.get("m_nFileCRC")?.as_u32()?;
            (crc != 0).then(|| (path.to_ascii_lowercase(), crc))
        })
        .collect()
}

/// Attachment points from the model's first render mesh that declares any.
pub fn model_attachments(resource: &Resource) -> Result<Vec<ModelAttachment>> {
    for block in resource.blocks.iter().filter(|block| block.name == "MDAT") {
        let Some(bytes) = resource.data.get(block.offset..block.offset + block.size) else {
            continue;
        };
        let Ok(mesh) = kv3::parse(bytes) else {
            continue;
        };
        let attachments: Vec<_> = mesh
            .get("m_attachments")
            .and_then(KvValue::as_array)
            .unwrap_or(&[])
            .iter()
            .filter_map(|entry| {
                let value = entry.get("value")?;
                let name = value.get("m_name")?.as_string()?.to_string();
                let bone = value
                    .get("m_influenceNames")?
                    .as_array()?
                    .first()?
                    .as_string()?
                    .to_string();
                let first = |key: &str| value.get(key)?.as_array()?.first();
                let offset = first("m_vInfluenceOffsets")?.as_f32_array::<3>()?;
                let rotation = first("m_vInfluenceRotations")?.as_f32_array::<4>()?;
                Some(ModelAttachment {
                    name,
                    bone,
                    offset: source_vec3_to_gltf(offset),
                    rotation: source_quat_to_gltf(rotation),
                })
            })
            .collect();
        if !attachments.is_empty() {
            return Ok(attachments);
        }
    }
    Ok(Vec::new())
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParticleLoadIssue {
    SystemLimit,
    DepthLimit,
    Cycle,
    Unavailable(String),
}

#[derive(Debug, Clone)]
pub struct ParticleLoadDiagnostic {
    pub path: String,
    pub issue: ParticleLoadIssue,
}

#[derive(Debug, Default)]
pub struct LoadedParticleSystems {
    pub systems: Vec<ParticleSystemFile>,
    pub diagnostics: Vec<ParticleLoadDiagnostic>,
}

/// Loads all roots against shared budgets of 48 reads and 16 MiB extracted,
/// with at most 2 MiB per entry and six child edges below each root. Failed
/// reads consume the read budget; extracted bytes count even if parsing fails.
/// Reports at most 96 diagnostics. Use this instead of loading roots separately.
/// These byte limits cover archive payloads, not KV3 decompression or JSON.
pub fn load_particle_systems(archive: &VpkArchive, paths: &[String]) -> LoadedParticleSystems {
    let mut remaining_bytes = MAX_SYSTEM_BYTES;
    load_systems_with(paths, |path| {
        let resource = Resource::parse(extract_budgeted(
            archive,
            &compiled(path),
            MAX_SYSTEM_ENTRY_BYTES,
            &mut remaining_bytes,
        )?)?;
        kv3::parse(
            resource
                .block_bytes("DATA")
                .ok_or_else(|| Source2Error::Resource(format!("{path} has no DATA block")))?,
        )
    })
}

/// Loads a single root. Multiple roots should use `load_particle_systems`.
pub fn load_particle_system(archive: &VpkArchive, path: &str) -> Result<ParticleSystemFile> {
    let mut loaded = load_particle_systems(archive, &[path.to_string()]);
    loaded.systems.pop().ok_or_else(|| {
        Source2Error::Resource(format!("Unable to load {path}: {:?}", loaded.diagnostics))
    })
}

fn particle_path(path: &str) -> String {
    let path = path.replace('\\', "/").to_ascii_lowercase();
    path.strip_suffix("_c").unwrap_or(&path).to_string()
}

fn diagnose(diagnostics: &mut Vec<ParticleLoadDiagnostic>, diagnostic: ParticleLoadDiagnostic) {
    if diagnostics.len() < MAX_DIAGNOSTICS {
        diagnostics.push(diagnostic);
    }
}

fn load_systems_with(
    paths: &[String],
    mut read: impl FnMut(&str) -> Result<KvValue>,
) -> LoadedParticleSystems {
    fn load(
        path: &str,
        ancestors: &mut Vec<String>,
        remaining: &mut usize,
        diagnostics: &mut Vec<ParticleLoadDiagnostic>,
        read: &mut impl FnMut(&str) -> Result<KvValue>,
    ) -> std::result::Result<ParticleSystemFile, ParticleLoadDiagnostic> {
        let path = particle_path(path);
        let issue = if ancestors.contains(&path) {
            Some(ParticleLoadIssue::Cycle)
        } else if ancestors.len() > MAX_DEPTH {
            Some(ParticleLoadIssue::DepthLimit)
        } else if *remaining == 0 {
            Some(ParticleLoadIssue::SystemLimit)
        } else {
            None
        };
        if let Some(issue) = issue {
            return Err(ParticleLoadDiagnostic { path, issue });
        }
        // Failed reads consume budget too, bounding work on corrupt archives.
        *remaining -= 1;
        let data = read(&path).map_err(|error| ParticleLoadDiagnostic {
            path: path.clone(),
            issue: ParticleLoadIssue::Unavailable(error.to_string()),
        })?;
        ancestors.push(path.clone());
        let mut children = Vec::new();
        for child in data
            .get("m_Children")
            .and_then(KvValue::as_array)
            .unwrap_or(&[])
        {
            if child.get("m_bDisableChild").and_then(KvValue::as_bool) == Some(true) {
                continue;
            }
            let Some(child_path) = child.get("m_ChildRef").and_then(KvValue::as_string) else {
                continue;
            };
            match load(child_path, ancestors, remaining, diagnostics, read) {
                Ok(child) => children.push(child),
                Err(diagnostic) => {
                    let exhausted = diagnostic.issue == ParticleLoadIssue::SystemLimit;
                    diagnose(diagnostics, diagnostic);
                    if exhausted {
                        break;
                    }
                }
            }
        }
        ancestors.pop();
        Ok(ParticleSystemFile {
            path,
            definition: data.to_json(),
            children,
        })
    }
    let mut result = LoadedParticleSystems::default();
    let mut remaining = MAX_SYSTEMS;
    let mut seen = BTreeSet::new();
    for path in paths {
        if !seen.insert(particle_path(path)) {
            continue;
        }
        match load(
            path,
            &mut Vec::new(),
            &mut remaining,
            &mut result.diagnostics,
            &mut read,
        ) {
            Ok(system) => result.systems.push(system),
            Err(diagnostic) => {
                let exhausted = diagnostic.issue == ParticleLoadIssue::SystemLimit;
                diagnose(&mut result.diagnostics, diagnostic);
                if exhausted {
                    break;
                }
            }
        }
    }
    result
}

/// Every texture a system tree's renderers draw with, by `.vtex` path.
pub fn particle_texture_paths(system: &ParticleSystemFile) -> BTreeSet<String> {
    fn collect(value: &serde_json::Value, out: &mut BTreeSet<String>) {
        match value {
            serde_json::Value::Object(map) => {
                for (key, item) in map {
                    match item {
                        serde_json::Value::String(path)
                            if key == "m_hTexture" && !path.is_empty() =>
                        {
                            out.insert(path.clone());
                        }
                        _ => collect(item, out),
                    }
                }
            }
            serde_json::Value::Array(items) => {
                for item in items {
                    collect(item, out);
                }
            }
            _ => {}
        }
    }
    let mut out = BTreeSet::new();
    if let Some(renderers) = system.definition.get("m_Renderers") {
        collect(renderers, &mut out);
    }
    for child in &system.children {
        out.extend(particle_texture_paths(child));
    }
    out
}

/// Decodes a particle texture to a PNG no larger than `max_side`, with its sprite sheet.
/// Rejects archive entries larger than 64 MiB before reading their payload.
/// Callers loading many textures must bound their count or total bytes separately.
pub fn particle_texture(
    archive: &VpkArchive,
    path: &str,
    max_side: u32,
) -> Result<ParticleTexture> {
    let resource =
        Resource::parse(archive.extract_entry_limited(&compiled(path), MAX_TEXTURE_ENTRY_BYTES)?)?;
    let header = VtexHeader::parse(&resource)?;
    let decoded = header.decode_preview(&resource.data, max_side)?;
    let png = crate::encode_png_bytes(&decoded, max_side)?;
    // Matches the downscale `encode_png_bytes` applies.
    let scale = (max_side as f32 / decoded.width.max(decoded.height) as f32).min(1.0);
    Ok(ParticleTexture {
        width: ((decoded.width as f32 * scale).round() as u32).max(1),
        height: ((decoded.height as f32 * scale).round() as u32).max(1),
        png,
        sequences: header
            .sprite_sheet_sequences(&resource.data)
            .unwrap_or_default(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    struct TestArchive {
        archive: VpkArchive,
        dir: std::path::PathBuf,
    }

    impl TestArchive {
        fn new(extension: &str, payload: &[u8], declared_length: usize) -> Self {
            let unique = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let dir =
                std::env::temp_dir().join(format!("s2m-particle-{}-{unique}", std::process::id()));
            std::fs::create_dir_all(&dir).unwrap();
            let path = dir.join("pak01_dir.vpk");
            let mut tree = format!("{extension}\0particles\0sample\0").into_bytes();
            tree.extend_from_slice(&0u32.to_le_bytes());
            tree.extend_from_slice(&0u16.to_le_bytes());
            tree.extend_from_slice(&0x7fffu16.to_le_bytes());
            tree.extend_from_slice(&0u32.to_le_bytes());
            tree.extend_from_slice(&u32::try_from(declared_length).unwrap().to_le_bytes());
            tree.extend_from_slice(&0xffffu16.to_le_bytes());
            tree.extend_from_slice(&[0; 3]);
            let mut bytes = 0x55aa1234u32.to_le_bytes().to_vec();
            bytes.extend_from_slice(&1u32.to_le_bytes());
            bytes.extend_from_slice(&u32::try_from(tree.len()).unwrap().to_le_bytes());
            bytes.extend_from_slice(&tree);
            bytes.extend_from_slice(payload);
            std::fs::write(&path, bytes).unwrap();
            Self {
                archive: VpkArchive::open(&path).unwrap(),
                dir,
            }
        }
    }

    impl Drop for TestArchive {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.dir);
        }
    }

    fn definition(children: &[&str]) -> KvValue {
        KvValue::Object(BTreeMap::from([(
            "m_Children".into(),
            KvValue::Array(
                children
                    .iter()
                    .map(|path| {
                        KvValue::Object(BTreeMap::from([(
                            "m_ChildRef".into(),
                            KvValue::String((*path).into()),
                        )]))
                    })
                    .collect(),
            ),
        )]))
    }

    fn system_count(systems: &[ParticleSystemFile]) -> usize {
        systems
            .iter()
            .map(|system| 1 + system_count(&system.children))
            .sum()
    }

    #[test]
    fn extraction_obeys_per_entry_and_remaining_aggregate_limits() {
        let fixture = TestArchive::new("vpcf_c", b"broken", 6);
        let path = "particles/sample.vpcf_c";
        let mut remaining = 10;
        assert!(extract_budgeted(&fixture.archive, path, 5, &mut remaining).is_err());
        assert_eq!(remaining, 10);
        assert_eq!(
            extract_budgeted(&fixture.archive, path, 6, &mut remaining).unwrap(),
            b"broken"
        );
        assert_eq!(remaining, 4);
        assert!(extract_budgeted(&fixture.archive, path, 6, &mut remaining).is_err());
        assert_eq!(remaining, 4);
    }

    #[test]
    fn extracted_invalid_resources_still_exhaust_the_aggregate_budget() {
        let fixture = TestArchive::new("vpcf_c", b"broken", 6);
        let mut remaining = 12;
        let loaded = load_systems_with(
            &[
                "first.vpcf".into(),
                "second.vpcf".into(),
                "third.vpcf".into(),
            ],
            |_| {
                Resource::parse(extract_budgeted(
                    &fixture.archive,
                    "particles/sample.vpcf_c",
                    6,
                    &mut remaining,
                )?)?;
                Ok(definition(&[]))
            },
        );
        assert_eq!(remaining, 0);
        assert!(loaded.systems.is_empty());
        assert_eq!(loaded.diagnostics.len(), 3);
        assert!(matches!(
            &loaded.diagnostics[2].issue,
            ParticleLoadIssue::Unavailable(message) if message.contains("aggregate preview byte limit")
        ));
    }

    #[test]
    fn public_loaders_reject_oversized_entries_before_reading_payloads() {
        let fixture = TestArchive::new("vpcf_c", &[], MAX_SYSTEM_ENTRY_BYTES + 1);
        let loaded = load_particle_systems(&fixture.archive, &["particles/sample.vpcf".into()]);
        assert!(loaded.systems.is_empty());
        assert_eq!(loaded.diagnostics.len(), 1);
        assert!(matches!(
            &loaded.diagnostics[0].issue,
            ParticleLoadIssue::Unavailable(message) if message.contains("preview byte limit")
        ));
        let fixture = TestArchive::new("vtex_c", &[], MAX_TEXTURE_ENTRY_BYTES + 1);
        let error = particle_texture(&fixture.archive, "particles/sample.vtex", 256).unwrap_err();
        assert!(error.to_string().contains("preview byte limit"));
    }

    #[test]
    fn failed_system_reads_consume_the_shared_read_budget() {
        let paths: Vec<_> = (0..MAX_SYSTEMS + 1)
            .map(|index| format!("missing{index}.vpcf"))
            .collect();
        let mut reads = 0;
        let loaded = load_systems_with(&paths, |_| {
            reads += 1;
            Err(Source2Error::Resource("missing".into()))
        });
        assert_eq!(reads, MAX_SYSTEMS);
        assert!(loaded.systems.is_empty());
        assert_eq!(loaded.diagnostics.len(), MAX_SYSTEMS + 1);
        assert_eq!(
            loaded.diagnostics.last().unwrap().issue,
            ParticleLoadIssue::SystemLimit
        );
    }

    #[test]
    fn cycles_at_the_exact_read_budget_are_not_reported_as_truncation() {
        let paths: Vec<_> = (0..MAX_SYSTEMS)
            .map(|index| format!("particles/root{index}.vpcf"))
            .collect();
        let loaded = load_systems_with(&paths, |path| {
            Ok(if path == paths.last().unwrap() {
                definition(&[&format!(
                    "{}_C",
                    path.to_ascii_uppercase().replace('/', "\\")
                )])
            } else {
                definition(&[])
            })
        });
        assert_eq!(loaded.systems.len(), MAX_SYSTEMS);
        assert_eq!(loaded.diagnostics.len(), 1);
        assert_eq!(loaded.diagnostics[0].path, "particles/root47.vpcf");
        assert_eq!(loaded.diagnostics[0].issue, ParticleLoadIssue::Cycle);
    }

    #[test]
    fn diagnostics_are_bounded_without_losing_healthy_siblings() {
        let mut child_paths = vec!["root.vpcf"; MAX_DIAGNOSTICS + 10];
        child_paths.push("leaf.vpcf");
        let mut reads = 0;
        let loaded = load_systems_with(&["root.vpcf".into()], |path| {
            reads += 1;
            Ok(if path == "root.vpcf" {
                definition(&child_paths)
            } else {
                definition(&[])
            })
        });
        assert_eq!(reads, 2);
        assert_eq!(loaded.diagnostics.len(), MAX_DIAGNOSTICS);
        assert!(
            loaded
                .diagnostics
                .iter()
                .all(|item| item.issue == ParticleLoadIssue::Cycle)
        );
        assert_eq!(loaded.systems[0].children[0].path, "leaf.vpcf");
    }

    #[test]
    fn repeated_children_are_instances_and_ancestors_reset_between_roots() {
        let loaded = load_systems_with(&["root.vpcf".into(), "leaf.vpcf".into()], |path| {
            Ok(if path == "root.vpcf" {
                definition(&["leaf.vpcf", "leaf.vpcf_c"])
            } else {
                definition(&[])
            })
        });
        assert_eq!(loaded.systems.len(), 2);
        assert_eq!(loaded.systems[0].children.len(), 2);
        assert!(loaded.diagnostics.is_empty());
    }

    #[test]
    fn reads_nested_preview_lists_ambient_paths_and_deduplicates() {
        let paths = preview_paths_in_key_values(
            r#"
            // particle_cfg_list = [ resource:"particles/wrong.vpcf" ]
            particle_cfg_list = [
                { name = resource : "particles/first.vpcf" nested = [ 1, 2 ] }
                { name = resource_name:"particles/second.vpcf_c" note = "]" }
            ]
            m_hAmbientParticle = resource_name:"particles/first.vpcf"
            m_vecAmbientParticleSettings = [ { m_hParticle = resource:"particles/ambient.vpcf" } ]
            irrelevant = resource:"particles/unrelated.vpcf"
        "#,
        );
        assert_eq!(
            paths,
            [
                "particles/first.vpcf",
                "particles/second.vpcf",
                "particles/ambient.vpcf"
            ]
        );
    }

    #[test]
    fn an_empty_ambient_reference_does_not_read_the_next_field() {
        assert!(
            preview_paths_in_key_values(
                r#"m_hAmbientParticle = resource_name:"" irrelevant = "particles/wrong.vpcf""#
            )
            .is_empty()
        );
    }

    #[test]
    fn one_budget_covers_all_roots_and_children() {
        let paths: Vec<_> = (0..30).map(|index| format!("root{index}.vpcf")).collect();
        let mut reads = 0;
        let loaded = load_systems_with(&paths, |path| {
            reads += 1;
            Ok(if path.starts_with("root") {
                definition(&["leaf.vpcf"])
            } else {
                definition(&[])
            })
        });
        assert_eq!(reads, MAX_SYSTEMS);
        assert_eq!(system_count(&loaded.systems), MAX_SYSTEMS);
        assert!(
            loaded
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.issue == ParticleLoadIssue::SystemLimit)
        );
    }

    #[test]
    fn exact_budget_does_not_report_truncation_and_duplicate_roots_are_ignored() {
        let mut paths: Vec<_> = (0..MAX_SYSTEMS)
            .map(|index| format!("root{index}.vpcf"))
            .collect();
        paths.push("ROOT0.vpcf_c".into());
        let loaded = load_systems_with(&paths, |_| Ok(definition(&[])));
        assert_eq!(loaded.systems.len(), MAX_SYSTEMS);
        assert!(loaded.diagnostics.is_empty());
    }

    #[test]
    fn cycles_and_missing_children_preserve_healthy_siblings() {
        let loaded = load_systems_with(&["root.vpcf".into()], |path| match path {
            "root.vpcf" => Ok(definition(&["root.vpcf_c", "missing.vpcf", "leaf.vpcf"])),
            "leaf.vpcf" => Ok(definition(&[])),
            _ => Err(Source2Error::Resource("missing".into())),
        });
        assert_eq!(loaded.systems[0].children.len(), 1);
        assert_eq!(loaded.systems[0].children[0].path, "leaf.vpcf");
        assert_eq!(loaded.diagnostics.len(), 2);
        assert_eq!(loaded.diagnostics[0].issue, ParticleLoadIssue::Cycle);
        assert!(matches!(
            loaded.diagnostics[1].issue,
            ParticleLoadIssue::Unavailable(_)
        ));
    }

    #[test]
    fn limits_depth_and_skips_disabled_children() {
        let loaded = load_systems_with(&["0.vpcf".into()], |path| {
            let index: usize = path.trim_end_matches(".vpcf").parse().unwrap();
            Ok(definition(&[&format!("{}.vpcf", index + 1)]))
        });
        assert_eq!(system_count(&loaded.systems), MAX_DEPTH + 1);
        assert_eq!(loaded.diagnostics[0].issue, ParticleLoadIssue::DepthLimit);
        let loaded = load_systems_with(&["root.vpcf".into()], |_| {
            let mut data = definition(&["disabled.vpcf"]);
            if let KvValue::Object(map) = &mut data {
                map.insert(
                    "m_Children".into(),
                    KvValue::Array(vec![KvValue::Object(BTreeMap::from([
                        ("m_ChildRef".into(), KvValue::String("disabled.vpcf".into())),
                        ("m_bDisableChild".into(), KvValue::Bool(true)),
                    ]))]),
                );
            }
            Ok(data)
        });
        assert_eq!(system_count(&loaded.systems), 1);
        assert!(loaded.diagnostics.is_empty());
    }

    #[test]
    #[ignore = "requires the local Hellboy VPK via DMM_PARTICLE_TEST_VPK"]
    fn hellboy_rebuilt_model_recovers_original_preview_metadata() {
        let path = std::env::var("DMM_PARTICLE_TEST_VPK").unwrap();
        let archive = VpkArchive::open(std::path::Path::new(&path)).unwrap();
        let entry = "models/heroes_wip/abrams/abrams.vmdl_c";
        let resource = Resource::parse(
            archive
                .extract_entry_limited(entry, MAX_MODEL_ENTRY_BYTES)
                .unwrap(),
        )
        .unwrap();
        assert!(model_preview_particles(&resource).unwrap().is_empty());
        let discovery = discover_model_preview_particles(&archive, &resource, entry).unwrap();
        assert_eq!(
            discovery.paths,
            ["particles/abilities/abrams/abrams_ambient_book.vpcf"]
        );
        assert_eq!(
            discovery.source_models,
            ["models/heroes_wip/abrams/_hellboy.vmdl_c"]
        );
        let loaded = load_particle_systems(&archive, &discovery.paths);
        assert_eq!(system_count(&loaded.systems), 3);
        assert!(loaded.diagnostics.is_empty());
        let entry = "models/heroes_wip/abrams/abrams_gun.vmdl_c";
        let resource = Resource::parse(
            archive
                .extract_entry_limited(entry, MAX_MODEL_ENTRY_BYTES)
                .unwrap(),
        )
        .unwrap();
        assert!(
            discover_model_preview_particles(&archive, &resource, entry)
                .unwrap()
                .paths
                .is_empty()
        );
    }
}
