use super::modding_workspace::{ModdingAddon, contained};
use crate::errors::Error;
use serde::Serialize;
use source2_model::{kv3::KvValue, vpk_extract::VpkArchive};
use std::{
  collections::{BTreeSet, HashMap},
  io::{Read, Seek, SeekFrom},
  path::{Path, PathBuf},
  sync::{Arc, LazyLock, Mutex},
};
use ts_rs::TS;

const MAX_METADATA: usize = 8 * 1024 * 1024;
const MAX_EXAMPLES: usize = 8;

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingFileUsage {
  pub path: String,
  pub addon_count: usize,
  pub deadlock_count: usize,
  pub addon_references: Vec<String>,
  pub deadlock_references: Vec<String>,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingUsageReport {
  pub files: Vec<ModdingFileUsage>,
  pub scanned_addon_files: usize,
  pub scanned_deadlock_files: usize,
  pub skipped_addon_files: usize,
  pub skipped_deadlock_files: usize,
  pub deadlock_available: bool,
  pub diagnostics: Vec<String>,
}

#[derive(Default)]
struct Referrers {
  count: usize,
  examples: Vec<String>,
}
#[derive(Default)]
struct ReferenceScan {
  references: Vec<String>,
  problems: Vec<String>,
}
#[derive(Default)]
struct UsageIndex {
  references: HashMap<String, Referrers>,
  scanned: usize,
  skipped: usize,
  diagnostics: Vec<String>,
}
impl UsageIndex {
  fn scan(&mut self, referrer: &str, asset_path: &str, scan: Result<ReferenceScan, String>) {
    match scan {
      Ok(scan) => {
        self.record(referrer, asset_path, scan.references);
        if !scan.problems.is_empty() {
          self.problem(referrer, scan.problems.join("; "));
        }
      }
      Err(error) => self.problem(referrer, error),
    }
  }
  fn record(&mut self, referrer: &str, asset_path: &str, references: Vec<String>) {
    self.scanned += 1;
    let own_path = normalize(asset_path);
    for reference in references
      .into_iter()
      .filter_map(|path| normalize(&path))
      .collect::<BTreeSet<_>>()
    {
      if Some(&reference) == own_path.as_ref() {
        continue;
      }
      if self.references.len() >= 500_000 && !self.references.contains_key(&reference) {
        self.problem(referrer, "Reference index exceeds 500,000 paths");
        continue;
      }
      let found = self.references.entry(reference).or_default();
      found.count += 1;
      if found.examples.len() < MAX_EXAMPLES {
        found.examples.push(referrer.to_owned());
      }
    }
  }
  fn problem(&mut self, path: &str, error: impl std::fmt::Display) {
    self.skipped += 1;
    if self.diagnostics.len() < 8 {
      self.diagnostics.push(format!("{path}: {error}"));
    }
  }
}

fn normalize(path: &str) -> Option<String> {
  let path = path.trim().replace('\\', "/").to_ascii_lowercase();
  let path = path
    .strip_prefix("file://{images}/")
    .map_or_else(|| path.clone(), |rest| format!("panorama/images/{rest}"));
  let path = if let Some((_, rest)) = path.split_once("/content/citadel_addons/") {
    rest.split_once('/')?.1
  } else if let Some((_, rest)) = path.split_once("/content/citadel/") {
    rest
  } else {
    path.trim_start_matches("./")
  };
  if !path.contains('.')
    || path.contains(['\0', '\n', '\r'])
    || path.split('/').any(|part| part == "..")
  {
    return None;
  }
  let extension = path.rsplit_once('.')?.1;
  if !extension.as_bytes().first()?.is_ascii_alphabetic()
    || !extension
      .bytes()
      .all(|ch| ch.is_ascii_alphanumeric() || ch == b'_')
  {
    return None;
  }
  let path = path.strip_suffix("_c").unwrap_or(path);
  let path = if let Some(stem) = path
    .strip_suffix(".wav")
    .or_else(|| path.strip_suffix(".mp3"))
  {
    format!("{stem}.vsnd")
  } else {
    path.to_owned()
  };
  Some(path)
}

fn text_references(text: &str) -> Vec<String> {
  static PATHS: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r#""([^"\r\n]+)"|'([^'\r\n]+)'|([A-Za-z0-9_{}./\\:-]+\.[A-Za-z0-9_]+)"#)
      .expect("asset path pattern")
  });
  PATHS
    .captures_iter(text)
    .filter_map(|capture| {
      let value = capture
        .get(1)
        .or_else(|| capture.get(2))
        .or_else(|| capture.get(3))?
        .as_str();
      // JSON and source strings can spell a path with escaped separators.
      normalize(&value.replace("\\\\", "/"))
    })
    .collect()
}

fn kv_references(value: &KvValue, result: &mut Vec<String>) {
  match value {
    KvValue::String(value) => {
      if let Some(path) = normalize(value) {
        result.push(path);
      }
    }
    KvValue::Object(values) => {
      for value in values.values() {
        kv_references(value, result);
      }
    }
    KvValue::Array(values) => {
      for value in values {
        kv_references(value, result);
      }
    }
    _ => {}
  }
}

fn compiled_references(
  mut read: impl FnMut(usize, usize) -> Result<Vec<u8>, String>,
  path: &str,
  source_metadata: bool,
) -> Result<ReferenceScan, String> {
  let header = read(0, 16)?;
  if u16::from_le_bytes([header[4], header[5]]) != 12 {
    return Err("Unsupported compiled resource header".into());
  }
  let word = |data: &[u8], start: usize| {
    u32::from_le_bytes(data[start..start + 4].try_into().unwrap()) as usize
  };
  let count = word(&header, 12);
  if count > 4096 {
    return Err("Resource block table exceeds 4096 entries".into());
  }
  let start = 8 + word(&header, 8);
  let table = read(start, count * 12)?;
  let mut result = ReferenceScan::default();
  for index in 0..count {
    let position = index * 12;
    let name = &table[position..position + 4];
    let data_strings = name == b"DATA"
      && ["vsndevts_c", "vdata_c", "vcompmat_c"].contains(
        &Path::new(path)
          .extension()
          .and_then(|ext| ext.to_str())
          .unwrap_or(""),
      );
    let source_block = source_metadata && (name == b"REDI" || name == b"RED2");
    if name != b"RERL" && !source_block && !data_strings {
      continue;
    }
    let length = word(&table, position + 8);
    if length == 0 {
      continue;
    }
    let block = (|| {
      if length > MAX_METADATA {
        return Err("Reference metadata exceeds 8 MB".into());
      }
      let data = read(start + position + 4 + word(&table, position + 4), length)?;
      if name == b"RERL" {
        super::modding_dependencies::references(&data).map_err(|error| error.to_string())
      } else if name == b"RED2" || data_strings {
        let tree = source2_model::kv3::parse(&data)
          .map_err(|error| format!("Unsupported reference metadata: {error}"))?;
        let mut references = Vec::new();
        kv_references(&tree, &mut references);
        Ok(references)
      } else {
        Ok(text_references(&String::from_utf8_lossy(&data)))
      }
    })();
    match block {
      Ok(references) => result.references.extend(references),
      Err(error) => result
        .problems
        .push(format!("{}: {error}", String::from_utf8_lossy(name))),
    }
  }
  Ok(result)
}

fn supported(path: &str) -> bool {
  path.ends_with("_c")
    || [
      "vmat", "vtex", "vpcf", "vdata", "vmdl", "vseq", "vnmgraph", "vcompmat", "vsndevts", "dmx",
      "txt", "kv", "kv3", "cfg", "json", "js", "ts", "xml", "nut", "lua",
    ]
    .contains(
      &Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or(""),
    )
}
fn loose_references(path: &Path, virtual_path: &str) -> Result<ReferenceScan, String> {
  let mut file = std::fs::File::open(path).map_err(|error| error.to_string())?;
  let length = file.metadata().map_err(|error| error.to_string())?.len();
  if virtual_path.ends_with("_c") {
    compiled_references(
      |offset, count| {
        if (offset as u64).saturating_add(count as u64) > length {
          return Err("Reference block is outside the file".into());
        }
        file
          .seek(SeekFrom::Start(offset as u64))
          .map_err(|error| error.to_string())?;
        let mut bytes = vec![0; count];
        file
          .read_exact(&mut bytes)
          .map_err(|error| error.to_string())?;
        Ok(bytes)
      },
      virtual_path,
      true,
    )
  } else {
    if length > MAX_METADATA as u64 {
      return Err("Text reference scan exceeds 8 MB".into());
    }
    let mut text = String::new();
    file
      .take((MAX_METADATA + 1) as u64)
      .read_to_string(&mut text)
      .map_err(|error| error.to_string())?;
    if text.len() > MAX_METADATA {
      return Err("Text reference scan exceeds 8 MB".into());
    }
    Ok(ReferenceScan {
      references: text_references(&text),
      problems: Vec::new(),
    })
  }
}
fn scan_loose(index: &mut UsageIndex, root: &Path, label: &str, paths: &[String]) {
  for path in paths.iter().filter(|path| supported(path)) {
    let referrer = format!("{label}/{path}");
    index.scan(
      &referrer,
      path,
      contained(root, path)
        .map_err(|error| error.to_string())
        .and_then(|file| loose_references(&file, path)),
    );
  }
}

struct CachedGameIndex {
  signature: String,
  index: Arc<UsageIndex>,
}
static GAME_INDEX: Mutex<Option<CachedGameIndex>> = Mutex::new(None);

fn game_index(game: &Path) -> Result<Arc<UsageIndex>, Error> {
  let mut roots = Vec::new();
  let mut stamp = Vec::new();
  for name in ["citadel", "core"] {
    let root = game.join("game").join(name);
    let paths: Vec<_> = super::modding_batch::files(&root)?
      .into_iter()
      .filter(|path| !path.starts_with("addons/"))
      .collect();
    // Companion timestamps matter too: a Steam update can replace their contents.
    for path in paths
      .iter()
      .filter(|path| supported(path) || path.starts_with("pak01") && path.ends_with(".vpk"))
    {
      let file = root.join(path);
      let metadata = file.metadata()?;
      stamp.extend_from_slice(
        format!(
          "{}:{}:{:?}\n",
          file.display(),
          metadata.len(),
          metadata.modified()?
        )
        .as_bytes(),
      );
    }
    roots.push((name, root, paths));
  }
  let signature = super::modding_edits::fingerprint(&stamp);
  let mut cached = GAME_INDEX
    .lock()
    .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?;
  if let Some(cached) = cached
    .as_ref()
    .filter(|cached| cached.signature == signature)
  {
    return Ok(Arc::clone(&cached.index));
  }
  let mut index = UsageIndex::default();
  for (name, root, paths) in roots {
    scan_loose(&mut index, &root, &format!("{name}/loose"), &paths);
    let pak = root.join("pak01_dir.vpk");
    match VpkArchive::open(&pak) {
      Ok(archive) => {
        for (path, size) in archive
          .entries_with_sizes()
          .filter(|(path, _)| supported(path))
        {
          let referrer = format!("{name}/pak01/{path}");
          let references = if path.ends_with("_c") {
            compiled_references(
              |offset, count| {
                archive
                  .read_entry_range(path, offset, count)
                  .map_err(|error| error.to_string())
              },
              path,
              false,
            )
          } else if size <= MAX_METADATA as u64 {
            archive
              .extract_entry_limited(path, MAX_METADATA)
              .map_err(|error| error.to_string())
              .and_then(|bytes| {
                String::from_utf8(bytes)
                  .map(|text| ReferenceScan {
                    references: text_references(&text),
                    problems: Vec::new(),
                  })
                  .map_err(|error| error.to_string())
              })
          } else {
            Err("Text reference scan exceeds 8 MB".into())
          };
          index.scan(&referrer, path, references);
        }
      }
      Err(error) => index.problem(&pak.to_string_lossy(), error),
    }
  }
  let index = Arc::new(index);
  *cached = Some(CachedGameIndex {
    signature,
    index: Arc::clone(&index),
  });
  Ok(index)
}

pub(super) fn check(
  addon: &ModdingAddon,
  paths: &[String],
  game: Result<PathBuf, Error>,
) -> ModdingUsageReport {
  let mut project = UsageIndex::default();
  for (label, root) in [("content", &addon.content_path), ("game", &addon.game_path)] {
    match super::modding_batch::files(Path::new(root)) {
      Ok(files) => scan_loose(&mut project, Path::new(root), label, &files),
      Err(error) => project.problem(label, error),
    }
  }
  let stock = game.and_then(|game| game_index(&game));
  let mut report = ModdingUsageReport {
    files: Vec::new(),
    scanned_addon_files: project.scanned,
    scanned_deadlock_files: stock.as_ref().map_or(0, |index| index.scanned),
    skipped_addon_files: project.skipped,
    skipped_deadlock_files: stock.as_ref().map_or(0, |index| index.skipped),
    deadlock_available: stock.is_ok(),
    diagnostics: project.diagnostics,
  };
  match &stock {
    Ok(index) => report.diagnostics.extend(index.diagnostics.clone()),
    Err(error) => report
      .diagnostics
      .push(format!("Deadlock reference scan unavailable: {error}")),
  }
  for path in paths {
    let key = normalize(path).unwrap_or_default();
    let local = project.references.get(&key);
    let game = stock
      .as_ref()
      .ok()
      .and_then(|index| index.references.get(&key));
    report.files.push(ModdingFileUsage {
      path: path.clone(),
      addon_count: local.map_or(0, |found| found.count),
      deadlock_count: game.map_or(0, |found| found.count),
      addon_references: local.map_or_else(Vec::new, |found| found.examples.clone()),
      deadlock_references: game.map_or_else(Vec::new, |found| found.examples.clone()),
    });
  }
  report
}

#[cfg(test)]
mod tests {
  use super::*;

  fn resource(blocks: &[(&[u8; 4], Vec<u8>)]) -> Vec<u8> {
    let mut bytes = vec![0; 16 + 12 * blocks.len()];
    bytes[4..6].copy_from_slice(&12u16.to_le_bytes());
    bytes[8..12].copy_from_slice(&8u32.to_le_bytes());
    bytes[12..16].copy_from_slice(&(blocks.len() as u32).to_le_bytes());
    for (index, (name, data)) in blocks.iter().enumerate() {
      let position = 16 + 12 * index;
      let offset = bytes.len() - position - 4;
      bytes[position..position + 4].copy_from_slice(*name);
      bytes[position + 4..position + 8].copy_from_slice(&(offset as u32).to_le_bytes());
      bytes[position + 8..position + 12].copy_from_slice(&(data.len() as u32).to_le_bytes());
      bytes.extend_from_slice(data);
    }
    bytes
  }
  fn dependency(path: &str) -> Vec<u8> {
    let mut bytes = vec![0; 24];
    bytes[..4].copy_from_slice(&8u32.to_le_bytes());
    bytes[4..8].copy_from_slice(&1u32.to_le_bytes());
    bytes[16..24].copy_from_slice(&8i64.to_le_bytes());
    bytes.extend_from_slice(path.as_bytes());
    bytes.push(0);
    bytes
  }
  fn pak(resource: &[u8]) -> Vec<u8> {
    let mut tree = b"vmat_c\0materials\0referrer\0".to_vec();
    tree.extend_from_slice(&0u32.to_le_bytes());
    tree.extend_from_slice(&0u16.to_le_bytes());
    tree.extend_from_slice(&0x7fffu16.to_le_bytes());
    tree.extend_from_slice(&0u32.to_le_bytes());
    tree.extend_from_slice(&(resource.len() as u32).to_le_bytes());
    tree.extend_from_slice(&0xffffu16.to_le_bytes());
    tree.extend_from_slice(b"\0\0\0");
    let mut bytes = 0x55aa1234u32.to_le_bytes().to_vec();
    bytes.extend_from_slice(&1u32.to_le_bytes());
    bytes.extend_from_slice(&(tree.len() as u32).to_le_bytes());
    bytes.extend(tree);
    bytes.extend_from_slice(resource);
    bytes
  }

  #[test]
  fn project_matches_full_paths_and_compiled_audio_aliases_without_self_references() {
    let root = tempfile::tempdir().unwrap();
    let content = root.path().join("content");
    let game = root.path().join("game");
    std::fs::create_dir_all(content.join("materials")).unwrap();
    std::fs::create_dir_all(game.join("materials")).unwrap();
    std::fs::write(content.join("materials/ref.vmat"), "Layer0 { TextureColor \"Textures\\\\hair.png\" Other \"elsewhere/hair.png\" Sound \"sounds/voice.vsnd_c\" }").unwrap();
    std::fs::write(
      game.join("materials/ref.vmat_c"),
      resource(&[
        (b"RERL", dependency("materials/ref.vmat")),
        (b"RED2", b"unsupported metadata".to_vec()),
      ]),
    )
    .unwrap();
    let addon = ModdingAddon {
      id: "test".into(),
      name: "test".into(),
      sdk_root: String::new(),
      content_path: content.to_string_lossy().into_owned(),
      game_path: game.to_string_lossy().into_owned(),
      archive_path: String::new(),
    };
    let paths = [
      "textures/hair.png",
      "unused/hair.png",
      "sounds/voice.wav",
      "materials/ref.vmat_c",
    ]
    .map(str::to_owned);
    let result = check(
      &addon,
      &paths,
      Err(Error::InvalidInput("Game not installed".into())),
    );
    assert_eq!(result.files[0].addon_count, 1);
    assert_eq!(result.files[1].addon_count, 0);
    assert_eq!(result.files[2].addon_count, 1);
    assert_eq!(result.files[3].addon_count, 0);
    assert!(!result.deadlock_available);
    assert_eq!(result.skipped_addon_files, 1);
    assert!(
      result
        .diagnostics
        .iter()
        .any(|message| message.contains("Game not installed"))
    );
  }

  #[test]
  fn malformed_optional_metadata_retains_known_dependencies() {
    let bytes = resource(&[
      (b"RERL", dependency("textures/hair.vtex")),
      (b"RED2", b"invalid".to_vec()),
    ]);
    let scan = compiled_references(
      |start, length| {
        bytes
          .get(start..start + length)
          .map(<[u8]>::to_vec)
          .ok_or_else(|| "outside fixture".into())
      },
      "materials/ref.vmat_c",
      true,
    )
    .unwrap();
    assert_eq!(scan.references, ["textures/hair.vtex_c"]);
    assert_eq!(scan.problems.len(), 1);
    let runtime = compiled_references(
      |start, length| {
        bytes
          .get(start..start + length)
          .map(<[u8]>::to_vec)
          .ok_or_else(|| "outside fixture".into())
      },
      "materials/ref.vmat_c",
      false,
    )
    .unwrap();
    assert_eq!(runtime.references, scan.references);
    assert!(runtime.problems.is_empty());
    let mut index = UsageIndex::default();
    index.scan(
      "game/materials/ref.vmat_c",
      "materials/ref.vmat_c",
      Ok(scan),
    );
    assert_eq!(index.references["textures/hair.vtex"].count, 1);
    assert_eq!(index.skipped, 1);
  }

  #[test]
  fn game_archive_index_is_reused_and_invalidated_when_installed_files_change() {
    let root = tempfile::tempdir().unwrap();
    let bytes = pak(&resource(&[(b"RERL", dependency("textures/hair.vtex"))]));
    for name in ["citadel", "core"] {
      let folder = root.path().join("game").join(name);
      std::fs::create_dir_all(&folder).unwrap();
      std::fs::write(folder.join("pak01_dir.vpk"), &bytes).unwrap();
    }
    let first = game_index(root.path()).unwrap();
    assert_eq!(first.references["textures/hair.vtex"].count, 2);
    assert_eq!(first.skipped, 0);
    assert!(Arc::ptr_eq(&first, &game_index(root.path()).unwrap()));
    std::fs::write(
      root.path().join("game/core/pak01_dir.vpk"),
      pak(&resource(&[(
        b"RERL",
        dependency("textures/changed_hair.vtex"),
      )])),
    )
    .unwrap();
    let changed = game_index(root.path()).unwrap();
    assert!(!Arc::ptr_eq(&first, &changed));
    assert_eq!(changed.references["textures/hair.vtex"].count, 1);
    assert_eq!(changed.references["textures/changed_hair.vtex"].count, 1);
  }

  #[test]
  fn virtual_image_paths_and_source_metadata_match_without_hash_guessing() {
    assert_eq!(
      normalize("file://{images}/hud/icon.psd").unwrap(),
      "panorama/images/hud/icon.psd"
    );
    assert_eq!(
      normalize("D:\\SDK\\content\\citadel_addons\\skin\\materials\\a.vmat").unwrap(),
      "materials/a.vmat"
    );
    assert_eq!(
      normalize("D:/SDK/content/citadel/materials/a.vmat").unwrap(),
      "materials/a.vmat"
    );
    assert!(normalize("../materials/a.vmat").is_none());
    assert_eq!(
      normalize("textures/hair_png_b0ba69eb.vtex_c").unwrap(),
      "textures/hair_png_b0ba69eb.vtex"
    );
    assert_ne!(
      normalize("textures/hair.png"),
      normalize("textures/hair_png_b0ba69eb.vtex_c")
    );
  }
}
