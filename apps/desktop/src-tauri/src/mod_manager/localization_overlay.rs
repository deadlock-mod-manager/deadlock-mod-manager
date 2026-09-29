use crate::errors::Error;
use crate::mod_manager::vdata_history::VdataHistoryIndex;
use keyvalues_parser::Value;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use source2_model::vpk_extract::VpkArchive;
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tempfile::TempDir;
use vpkmanager::pack_directory;
use vpkmanager::source2::kv3::{self, Encoding as Kv3Encoding, Seg as Kv3Seg, Value as Kv3Value};
use vpkmanager::source2::resource::Resource;

pub const OVERLAY_VPK_NAME: &str = "pak01_dir.vpk";
const STALE_SNAPSHOT_CHANGE_THRESHOLD: usize = 50;
const HEROES_VDATA_PATH: &str = "scripts/heroes.vdata_c";
const PROTECTED_LOCALIZATION_PATHS: [&str; 2] = [
  "resource/localization/citadel_gc_hero_names/citadel_gc_hero_names_english.txt",
  "resource/localization/citadel_heroes/citadel_heroes_english.txt",
];

#[derive(Debug, Clone)]
pub struct LocalizationModInput {
  pub mod_id: String,
  pub vpks: Vec<PathBuf>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalizationCandidate {
  pub mod_id: String,
  pub source_vpk: String,
  pub value: String,
  pub priority: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalizationConflict {
  pub key: String,
  pub file_path: String,
  pub token: String,
  pub vanilla_value: Option<String>,
  pub candidates: Vec<LocalizationCandidate>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompiledDataCandidate {
  pub mod_id: String,
  pub source_vpk: String,
  pub priority: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompiledDataConflict {
  pub key: String,
  pub file_path: String,
  pub row_name: String,
  pub field_path: String,
  pub existed_in_vanilla: bool,
  pub candidates: Vec<CompiledDataCandidate>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalizationSnapshotWarning {
  pub mod_id: String,
  pub file_path: String,
  pub changed_tokens: usize,
  pub total_tokens: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalizationParseWarning {
  pub mod_id: String,
  pub file_path: String,
  pub skipped_lines: Vec<usize>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeroIdReassignment {
  pub row_name: String,
  pub mod_id: String,
  pub requested_id: i64,
  pub assigned_id: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalizationOverlayAnalysis {
  pub scanned_mods: usize,
  pub scanned_vpks: usize,
  pub localization_files: usize,
  pub ignored_vanilla_tokens: usize,
  pub ignored_historical_tokens: usize,
  pub changed_tokens: usize,
  pub new_tokens: usize,
  pub conflicts: Vec<LocalizationConflict>,
  pub compiled_data_files: usize,
  pub ignored_vanilla_rows: usize,
  pub changed_rows: usize,
  pub new_rows: usize,
  pub compiled_data_conflicts: Vec<CompiledDataConflict>,
  pub hero_id_reassignments: Vec<HeroIdReassignment>,
  pub snapshot_warnings: Vec<LocalizationSnapshotWarning>,
  pub parse_warnings: Vec<LocalizationParseWarning>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalizationResolution {
  pub conflict_key: String,
  #[serde(default)]
  pub winner_mod_id: Option<String>,
  #[serde(default)]
  pub winner_value: Option<String>,
  #[serde(default)]
  pub winner_source_vpk: Option<String>,
  #[serde(default)]
  pub use_vanilla: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalizationOverlayApplyResult {
  pub has_overlay: bool,
  pub output_path: Option<String>,
  pub packed_files: usize,
  pub applied_tokens: usize,
  pub applied_compiled_rows: usize,
}

#[derive(Debug, Clone)]
struct LocalizationFile {
  language: String,
  tokens: BTreeMap<String, String>,
}

struct ParsedLocalizationFile {
  file: LocalizationFile,
  skipped_lines: Vec<usize>,
}

#[derive(Default)]
struct HistoricalLocalizationIndex {
  fingerprints: BTreeSet<[u8; 32]>,
}

impl HistoricalLocalizationIndex {
  fn embedded() -> &'static Self {
    static INDEX: OnceLock<HistoricalLocalizationIndex> = OnceLock::new();
    INDEX.get_or_init(|| {
      HistoricalLocalizationIndex::from_bytes(include_bytes!(
        "../../assets/localization-history.bin"
      ))
      .expect("embedded localization history index is valid")
    })
  }

  fn from_bytes(bytes: &[u8]) -> Option<Self> {
    let (magic, payload) = bytes.split_at_checked(8)?;
    if magic != b"DMMLOC01" {
      return None;
    }
    let (count, fingerprints) = payload.split_at_checked(4)?;
    let count = usize::try_from(u32::from_le_bytes(count.try_into().ok()?)).ok()?;
    if fingerprints.len() != count.checked_mul(32)? {
      return None;
    }
    Some(Self {
      fingerprints: fingerprints
        .chunks_exact(32)
        .map(|fingerprint| fingerprint.try_into().expect("chunk size is fixed"))
        .collect(),
    })
  }

  #[cfg(test)]
  fn insert_file(&mut self, file_path: &str, file: &LocalizationFile) {
    for (token, value) in &file.tokens {
      self
        .fingerprints
        .insert(localization_fingerprint(file_path, token, value));
    }
  }

  fn contains(&self, file_path: &str, token: &str, value: &str) -> bool {
    self
      .fingerprints
      .contains(&localization_fingerprint(file_path, token, value))
  }
}

#[derive(Debug, Clone)]
struct CandidateGroup {
  key: String,
  file_path: String,
  token: String,
  vanilla_value: Option<String>,
  candidates: Vec<LocalizationCandidate>,
}

#[derive(Debug, Clone)]
struct CompiledDataCandidateValue {
  candidate: CompiledDataCandidate,
  value: Kv3Value,
  encoding: Kv3Encoding,
}

#[derive(Debug, Clone)]
struct HeroIdRequest {
  row_name: String,
  mod_id: String,
  priority: usize,
  requested_id: i64,
}

struct CompiledDataSource {
  mod_id: String,
  source_vpk: String,
  priority: usize,
  bytes: Vec<u8>,
}

#[derive(Debug, Clone)]
struct CompiledDataGroup {
  key: String,
  file_path: String,
  row_name: String,
  path: Vec<Kv3Seg>,
  existed_in_vanilla: bool,
  candidates: Vec<CompiledDataCandidateValue>,
}

struct CompiledDataTable {
  file_path: String,
  base_bytes: Vec<u8>,
  format: kv3::Format,
  base_root: Kv3Value,
  base_encoding: Kv3Encoding,
  groups: BTreeMap<String, CompiledDataGroup>,
  files: usize,
  ignored_vanilla_rows: usize,
}

pub struct LocalizationOverlayPlan {
  pub analysis: LocalizationOverlayAnalysis,
  bases: BTreeMap<String, LocalizationFile>,
  groups: BTreeMap<String, CandidateGroup>,
  compiled_data: Vec<CompiledDataTable>,
}

impl LocalizationOverlayPlan {
  pub fn build(
    citadel_dir: &Path,
    mods: &[LocalizationModInput],
  ) -> Result<LocalizationOverlayPlan, Error> {
    Self::build_with_history(citadel_dir, mods, HistoricalLocalizationIndex::embedded())
  }

  fn build_with_history(
    citadel_dir: &Path,
    mods: &[LocalizationModInput],
    historical_localization: &HistoricalLocalizationIndex,
  ) -> Result<LocalizationOverlayPlan, Error> {
    let mut bases: BTreeMap<String, LocalizationFile> = BTreeMap::new();
    let mut groups: BTreeMap<String, CandidateGroup> = BTreeMap::new();
    let mut localization_files = 0usize;
    let mut ignored_vanilla_tokens = 0usize;
    let mut ignored_historical_tokens = 0usize;
    let mut scanned_vpks = 0usize;
    let mut snapshot_warnings = Vec::new();
    let mut parse_warnings = Vec::new();
    let mut compiled_sources: BTreeMap<String, Vec<CompiledDataSource>> = BTreeMap::new();

    for (priority, mod_input) in mods.iter().enumerate() {
      for vpk_path in &mod_input.vpks {
        scanned_vpks += 1;
        let archive = VpkArchive::open(vpk_path).map_err(|error| {
          Error::ModInvalid(format!(
            "Failed to open localization VPK {}: {error}",
            vpk_path.display()
          ))
        })?;
        let source_name = vpk_path
          .file_name()
          .and_then(|name| name.to_str())
          .unwrap_or("unknown.vpk")
          .to_string();
        let mut localization_paths = Vec::new();
        let mut compiled_paths = Vec::new();
        for entry_path in archive.list_entries() {
          if is_localization_path(&entry_path) {
            localization_paths.push(entry_path);
          } else if is_mergeable_compiled_data_path(&entry_path) {
            compiled_paths.push(entry_path);
          }
        }
        localization_paths.sort();
        compiled_paths.sort();

        for file_path in compiled_paths {
          if archive.has_preload_bytes(&file_path) {
            return Err(Error::ModInvalid(format!(
              "{} stores compiled-data preload bytes in {file_path}, which DMM cannot merge safely yet",
              mod_input.mod_id
            )));
          }
          let bytes = archive.extract_entry(&file_path).map_err(|error| {
            Error::ModInvalid(format!(
              "Failed to extract {file_path} from {}: {error}",
              vpk_path.display()
            ))
          })?;
          compiled_sources
            .entry(normalize_path(&file_path))
            .or_default()
            .push(CompiledDataSource {
              mod_id: mod_input.mod_id.clone(),
              source_vpk: source_name.clone(),
              priority,
              bytes,
            });
        }

        for file_path in localization_paths {
          let normalized_file = normalize_path(&file_path);
          if archive.has_preload_bytes(&file_path) {
            return Err(Error::ModInvalid(format!(
              "{} stores localization preload bytes in {file_path}, which DMM cannot merge safely yet",
              mod_input.mod_id
            )));
          }

          let base = match bases.get(&normalized_file) {
            Some(base) => base.clone(),
            None => {
              let loose_path = citadel_dir.join(file_path.replace('\\', "/"));
              let parsed = if loose_path.is_file() {
                parse_localization_bytes(&fs::read(&loose_path)?, &loose_path.to_string_lossy())?
                  .file
              } else {
                LocalizationFile {
                  language: infer_language(&file_path),
                  tokens: BTreeMap::new(),
                }
              };
              bases.insert(normalized_file.clone(), parsed.clone());
              parsed
            }
          };

          let bytes = archive.extract_entry(&file_path).map_err(|error| {
            Error::ModInvalid(format!(
              "Failed to extract {file_path} from {}: {error}",
              vpk_path.display()
            ))
          })?;
          let parsed_mod_file =
            parse_localization_bytes(&bytes, &format!("{}:{file_path}", mod_input.mod_id))?;
          if !parsed_mod_file.skipped_lines.is_empty() {
            parse_warnings.push(LocalizationParseWarning {
              mod_id: mod_input.mod_id.clone(),
              file_path: file_path.replace('\\', "/"),
              skipped_lines: parsed_mod_file.skipped_lines,
            });
          }
          let mod_file = parsed_mod_file.file;
          localization_files += 1;
          let total_tokens = mod_file.tokens.len();
          let mut changed_in_file = 0usize;

          for (token, value) in mod_file.tokens {
            let vanilla_value = get_case_insensitive(&base.tokens, &token).map(str::to_string);
            if vanilla_value.as_deref() == Some(value.as_str()) {
              ignored_vanilla_tokens += 1;
              continue;
            }

            if is_protected_localization_path(&normalized_file)
              && historical_localization.contains(&normalized_file, &token, &value)
            {
              ignored_historical_tokens += 1;
              continue;
            }

            changed_in_file += 1;
            let key = conflict_key(&normalized_file, &token);
            let group = groups.entry(key.clone()).or_insert_with(|| CandidateGroup {
              key,
              file_path: file_path.replace('\\', "/"),
              token: token.clone(),
              vanilla_value,
              candidates: Vec::new(),
            });
            group.candidates.push(LocalizationCandidate {
              mod_id: mod_input.mod_id.clone(),
              source_vpk: source_name.clone(),
              value,
              priority,
            });
          }

          if changed_in_file >= STALE_SNAPSHOT_CHANGE_THRESHOLD
            && !base.tokens.is_empty()
            && total_tokens >= STALE_SNAPSHOT_CHANGE_THRESHOLD
          {
            snapshot_warnings.push(LocalizationSnapshotWarning {
              mod_id: mod_input.mod_id.clone(),
              file_path: file_path.replace('\\', "/"),
              changed_tokens: changed_in_file,
              total_tokens,
            });
          }
        }
      }
    }

    let compiled_data = build_compiled_data(citadel_dir, compiled_sources)?;
    let mut changed_tokens = 0usize;
    let mut new_tokens = 0usize;
    let mut conflicts = Vec::new();
    for group in groups.values() {
      if group.vanilla_value.is_some() {
        changed_tokens += 1;
      } else {
        new_tokens += 1;
      }
      let distinct_values: BTreeSet<&str> = group
        .candidates
        .iter()
        .map(|candidate| candidate.value.as_str())
        .collect();
      if distinct_values.len() > 1 {
        conflicts.push(LocalizationConflict {
          key: group.key.clone(),
          file_path: group.file_path.clone(),
          token: group.token.clone(),
          vanilla_value: group.vanilla_value.clone(),
          candidates: group.candidates.clone(),
        });
      }
    }

    let (
      compiled_data_files,
      ignored_vanilla_rows,
      changed_rows,
      new_rows,
      compiled_data_conflicts,
    ) = compiled_data_analysis(&compiled_data);
    let hero_id_reassignments = default_hero_id_reassignments(&compiled_data)?;

    Ok(Self {
      analysis: LocalizationOverlayAnalysis {
        scanned_mods: mods.len(),
        scanned_vpks,
        localization_files,
        ignored_vanilla_tokens,
        ignored_historical_tokens,
        changed_tokens,
        new_tokens,
        conflicts,
        compiled_data_files,
        ignored_vanilla_rows,
        changed_rows,
        new_rows,
        compiled_data_conflicts,
        hero_id_reassignments,
        snapshot_warnings,
        parse_warnings,
      },
      bases,
      groups,
      compiled_data,
    })
  }

  pub fn write(
    &self,
    output_path: &Path,
    resolutions: &[LocalizationResolution],
  ) -> Result<LocalizationOverlayApplyResult, Error> {
    let resolution_map: BTreeMap<&str, &LocalizationResolution> = resolutions
      .iter()
      .map(|resolution| (resolution.conflict_key.as_str(), resolution))
      .collect();
    let mut output_files: BTreeMap<String, LocalizationFile> = BTreeMap::new();
    let mut applied_tokens = 0usize;

    for (normalized_file, group) in self
      .groups
      .values()
      .map(|group| (normalize_path(&group.file_path), group))
    {
      let resolution = resolution_map.get(group.key.as_str()).copied();
      let winner = choose_winner(group, resolution)?;
      let Some(winner) = winner else {
        continue;
      };

      let output_file = output_files
        .entry(normalized_file.clone())
        .or_insert_with(|| {
          self
            .bases
            .get(&normalized_file)
            .cloned()
            .unwrap_or_else(|| LocalizationFile {
              language: infer_language(&group.file_path),
              tokens: BTreeMap::new(),
            })
        });
      set_case_insensitive(&mut output_file.tokens, &group.token, winner.value.clone());
      applied_tokens += 1;
    }

    let workspace = TempDir::new()?;
    for (normalized_file, localization) in &output_files {
      let output_file = workspace.path().join(normalized_file);
      if let Some(parent) = output_file.parent() {
        fs::create_dir_all(parent)?;
      }
      fs::write(output_file, render_localization(localization))?;
    }

    let mut applied_compiled_rows = 0usize;
    for compiled_data in &self.compiled_data {
      applied_compiled_rows += compiled_data.write_to_directory(workspace.path(), resolutions)?;
    }

    if output_files.is_empty() && applied_compiled_rows == 0 {
      if output_path.is_file() {
        fs::remove_file(output_path)?;
      }
      return Ok(LocalizationOverlayApplyResult {
        has_overlay: false,
        output_path: None,
        packed_files: 0,
        applied_tokens: 0,
        applied_compiled_rows: 0,
      });
    }

    let packed_files = pack_directory(workspace.path(), output_path).map_err(|error| {
      Error::ModInvalid(format!("Failed to pack merged mod-data overlay: {error}"))
    })?;
    Ok(LocalizationOverlayApplyResult {
      has_overlay: true,
      output_path: Some(output_path.display().to_string()),
      packed_files,
      applied_tokens,
      applied_compiled_rows,
    })
  }
}

fn build_compiled_data(
  citadel_dir: &Path,
  sources_by_path: BTreeMap<String, Vec<CompiledDataSource>>,
) -> Result<Vec<CompiledDataTable>, Error> {
  if sources_by_path.is_empty() {
    return Ok(Vec::new());
  }

  let base_vpk = citadel_dir.join("pak01_dir.vpk");
  let base_archive = VpkArchive::open(&base_vpk).map_err(|error| {
    Error::ModInvalid(format!(
      "Failed to open base game VPK {}: {error}",
      base_vpk.display()
    ))
  })?;
  let base_paths: BTreeMap<String, String> = base_archive
    .list_entries()
    .into_iter()
    .filter(|path| is_mergeable_compiled_data_path(path))
    .map(|path| (normalize_path(&path), path))
    .collect();
  let mut tables = Vec::new();
  for (file_path, sources) in sources_by_path {
    let Some(base_path) = base_paths.get(&file_path) else {
      // A unique compiled file is already visible through its owning mod VPK. DMM
      // only needs to build an overlay when there is a base table to merge into.
      continue;
    };
    let base_bytes = base_archive
      .extract_entry(base_path)
      .map_err(|error| Error::ModInvalid(format!("Failed to extract base {base_path}: {error}")))?;
    tables.push(build_compiled_table(
      &file_path,
      base_bytes,
      sources,
      Some(VdataHistoryIndex::embedded()),
    )?);
  }
  Ok(tables)
}

fn build_compiled_table(
  file_path: &str,
  base_bytes: Vec<u8>,
  sources: Vec<CompiledDataSource>,
  history: Option<&VdataHistoryIndex>,
) -> Result<CompiledDataTable, Error> {
  let (format, base_root, base_encoding) = decode_compiled_data(&base_bytes, "base game")?;
  let Kv3Value::Object(base_rows) = &base_root else {
    return Err(Error::ModInvalid(format!(
      "Base {file_path} root is not an object"
    )));
  };
  if base_encoding.as_object().is_none() {
    return Err(Error::ModInvalid(format!(
      "Base {file_path} encoding root is not an object"
    )));
  }
  let base_row_encodings = base_encoding
    .as_object()
    .expect("base encoding root was validated as an object");

  let files = sources.len();
  let mut ignored_vanilla_rows = 0usize;
  let mut groups: BTreeMap<String, CompiledDataGroup> = BTreeMap::new();
  for source in sources {
    let CompiledDataSource {
      mod_id,
      source_vpk,
      priority,
      bytes,
    } = source;
    let (_, mod_root, mod_encoding) =
      decode_compiled_data(&bytes, &format!("{mod_id}:{source_vpk}:{file_path}"))?;
    let baseline = history.and_then(|history| history.match_baseline(file_path, &mod_root));
    if let Some(baseline) = &baseline {
      #[cfg(test)]
      println!(
        "matched {mod_id}:{source_vpk}:{file_path} to v{} ({}/{} rows changed)",
        baseline.build_version, baseline.changed_rows, baseline.comparable_rows
      );
      log::info!(
        "Matched {mod_id}:{source_vpk}:{file_path} to historical build v{} ({} comparable rows, {} changed)",
        baseline.build_version,
        baseline.comparable_rows,
        baseline.changed_rows
      );
    }
    let Kv3Value::Object(mod_rows) = mod_root else {
      return Err(Error::ModInvalid(format!(
        "{mod_id}:{source_vpk}:{file_path} root is not an object"
      )));
    };
    let mod_row_encodings = mod_encoding.as_object().ok_or_else(|| {
      Error::ModInvalid(format!(
        "{mod_id}:{source_vpk}:{file_path} encoding root is not an object"
      ))
    })?;

    for (row_name, value) in mod_rows {
      let row_encoding = encoding_get_case_insensitive(mod_row_encodings, &row_name)
        .ok_or_else(|| {
          Error::ModInvalid(format!(
            "{mod_id}:{source_vpk}:{file_path} has no encoding for row {row_name}"
          ))
        })?
        .clone();
      let vanilla_value = object_get_case_insensitive(base_rows, &row_name);
      let vanilla_encoding = encoding_get_case_insensitive(base_row_encodings, &row_name);
      if vanilla_value.is_some_and(|vanilla| runtime_values_equal(vanilla, &value)) {
        ignored_vanilla_rows += 1;
        continue;
      }
      let patches = if let (Some(vanilla), Some(baseline)) = (vanilla_value, baseline.as_ref())
        && baseline.contains_row(&row_name)
      {
        let mut candidate_fields = Vec::new();
        collect_compiled_fields(
          &value,
          &row_encoding,
          &mut Vec::new(),
          &mut candidate_fields,
        )?;
        candidate_fields
          .into_iter()
          .filter(|(path, candidate, _)| {
            !baseline.field_matches(&row_name, path, candidate)
              && !compiled_value_at_path(vanilla, path)
                .is_some_and(|current| runtime_values_equal(current, candidate))
          })
          .collect()
      } else if let Some(vanilla) = vanilla_value {
        let mut patches = Vec::new();
        collect_compiled_patches(
          vanilla,
          &value,
          &row_encoding,
          &mut Vec::new(),
          &mut patches,
        )?;
        patches
      } else {
        vec![(Vec::new(), value.clone(), row_encoding.clone())]
      };
      let patches =
        if let (Some(vanilla), Some(vanilla_encoding)) = (vanilla_value, vanilla_encoding) {
          patches
            .into_iter()
            .map(|patch| {
              promote_patch_to_applicable_ancestor(
                vanilla,
                vanilla_encoding,
                &value,
                &row_encoding,
                patch,
              )
            })
            .collect::<Result<Vec<_>, Error>>()?
        } else {
          patches
        };
      if patches.is_empty() {
        ignored_vanilla_rows += 1;
        continue;
      }
      let mut distinct_patches = BTreeMap::new();
      for (path, value, encoding) in patches {
        let key = compiled_conflict_key(file_path, &row_name, &path);
        distinct_patches
          .entry(key)
          .or_insert((path, value, encoding));
      }
      for (key, (path, value, encoding)) in distinct_patches {
        let group = groups
          .entry(key.clone())
          .or_insert_with(|| CompiledDataGroup {
            key,
            file_path: file_path.to_string(),
            row_name: row_name.clone(),
            path,
            existed_in_vanilla: vanilla_value.is_some(),
            candidates: Vec::new(),
          });
        group.candidates.push(CompiledDataCandidateValue {
          candidate: CompiledDataCandidate {
            mod_id: mod_id.clone(),
            source_vpk: source_vpk.clone(),
            priority,
          },
          value,
          encoding,
        });
      }
    }
  }

  Ok(CompiledDataTable {
    file_path: file_path.to_string(),
    base_bytes,
    format,
    base_root,
    base_encoding,
    groups,
    files,
    ignored_vanilla_rows,
  })
}

fn compiled_data_analysis(
  tables: &[CompiledDataTable],
) -> (usize, usize, usize, usize, Vec<CompiledDataConflict>) {
  let mut files = 0usize;
  let mut ignored_vanilla_rows = 0usize;
  let mut changed_rows = BTreeSet::new();
  let mut new_rows = BTreeSet::new();
  let mut conflicts = Vec::new();
  for table in tables {
    files += table.files;
    ignored_vanilla_rows += table.ignored_vanilla_rows;
    for group in table.groups.values() {
      if group.existed_in_vanilla {
        changed_rows.insert((
          group.file_path.as_str(),
          group.row_name.to_ascii_lowercase(),
        ));
      } else {
        new_rows.insert((
          group.file_path.as_str(),
          group.row_name.to_ascii_lowercase(),
        ));
      }
      let mut distinct_values: Vec<&Kv3Value> = Vec::new();
      for candidate in &group.candidates {
        if !distinct_values
          .iter()
          .any(|value| runtime_values_equal(value, &candidate.value))
        {
          distinct_values.push(&candidate.value);
        }
      }
      if distinct_values.len() > 1 {
        conflicts.push(CompiledDataConflict {
          key: group.key.clone(),
          file_path: group.file_path.clone(),
          row_name: group.row_name.clone(),
          field_path: compiled_path_label(&group.path),
          existed_in_vanilla: group.existed_in_vanilla,
          candidates: group
            .candidates
            .iter()
            .map(|candidate| candidate.candidate.clone())
            .collect(),
        });
      }
    }
  }
  (
    files,
    ignored_vanilla_rows,
    changed_rows.len(),
    new_rows.len(),
    conflicts,
  )
}

impl CompiledDataTable {
  fn write_to_directory(
    &self,
    output_root: &Path,
    resolutions: &[LocalizationResolution],
  ) -> Result<usize, Error> {
    let resolution_map: BTreeMap<&str, &LocalizationResolution> = resolutions
      .iter()
      .map(|resolution| (resolution.conflict_key.as_str(), resolution))
      .collect();
    let mut merged_root = self.base_root.clone();
    let mut merged_encoding = self.base_encoding.clone();
    let Kv3Value::Object(merged_rows) = &mut merged_root else {
      return Err(Error::ModInvalid(format!(
        "Base {} root is not an object",
        self.file_path
      )));
    };
    let merged_row_encodings = merged_encoding.as_object_mut().ok_or_else(|| {
      Error::ModInvalid(format!(
        "Base {} encoding root is not an object",
        self.file_path
      ))
    })?;
    let mut applied_rows = BTreeSet::new();
    let mut added_hero_winners = Vec::new();
    for group in self.groups.values() {
      let resolution = resolution_map.get(group.key.as_str()).copied();
      let Some(winner) = choose_compiled_winner(group, resolution)? else {
        continue;
      };
      if group.path.is_empty() {
        object_set_case_insensitive(merged_rows, &group.row_name, winner.value.clone());
        encoding_set_case_insensitive(
          merged_row_encodings,
          &group.row_name,
          winner.encoding.clone(),
        );
      } else {
        let row =
          object_get_case_insensitive_mut(merged_rows, &group.row_name).ok_or_else(|| {
            Error::ModInvalid(format!(
              "Base {} has no row {} required by a field patch",
              self.file_path, group.row_name
            ))
          })?;
        set_compiled_value_at_path(row, &group.path, winner.value.clone())?;
        let row_encoding = encoding_get_case_insensitive_mut(merged_row_encodings, &group.row_name)
          .ok_or_else(|| {
            Error::ModInvalid(format!(
              "Base {} has no encoding for row {} required by a field patch",
              self.file_path, group.row_name
            ))
          })?;
        set_compiled_encoding_at_path(row_encoding, &group.path, winner.encoding.clone())?;
      }
      if self.file_path == HEROES_VDATA_PATH && !group.existed_in_vanilla {
        if let Some(requested_id) = compiled_hero_id(&winner.value) {
          added_hero_winners.push(HeroIdRequest {
            row_name: group.row_name.clone(),
            mod_id: winner.candidate.mod_id.clone(),
            priority: winner.candidate.priority,
            requested_id,
          });
        }
      }
      applied_rows.insert(group.row_name.to_ascii_lowercase());
    }
    if applied_rows.is_empty() {
      return Ok(0);
    }

    if self.file_path == HEROES_VDATA_PATH {
      assign_unique_added_hero_ids(&self.base_root, merged_rows, added_hero_winners)?;
    }

    let mut expected_rows = BTreeMap::new();
    for group in self.groups.values() {
      let resolution = resolution_map.get(group.key.as_str()).copied();
      if choose_compiled_winner(group, resolution)?.is_some() {
        let value = object_get_case_insensitive(merged_rows, &group.row_name)
          .expect("applied compiled row remains present in the merged root")
          .clone();
        expected_rows.insert(group.key.clone(), value);
      }
    }

    let new_data =
      kv3::encode_preserving(&merged_root, &merged_encoding, &self.format).map_err(|error| {
        Error::ModInvalid(format!(
          "Failed to encode merged {} while preserving Source 2 types: {error}",
          self.file_path
        ))
      })?;
    let rebuilt = Resource::parse(&self.base_bytes)
      .map_err(|error| Error::ModInvalid(format!("Failed to parse base compiled data: {error}")))?
      .rebuild_with_data(&new_data)
      .map_err(|error| Error::ModInvalid(format!("Failed to rebuild compiled data: {error}")))?;
    let (_, verified_root, _) = decode_compiled_data(&rebuilt, "rebuilt overlay")?;
    let Kv3Value::Object(verified_rows) = verified_root else {
      return Err(Error::ModInvalid(format!(
        "Rebuilt {} root is not an object",
        self.file_path
      )));
    };
    for group in self.groups.values() {
      let Some(expected) = expected_rows.get(&group.key) else {
        continue;
      };
      if !object_get_case_insensitive(&verified_rows, &group.row_name)
        .is_some_and(|value| runtime_values_equal(value, expected))
      {
        return Err(Error::ModInvalid(format!(
          "Rebuilt {} lost row {}",
          self.file_path, group.row_name
        )));
      }
    }

    let output_file = output_root.join(&self.file_path);
    if let Some(parent) = output_file.parent() {
      fs::create_dir_all(parent)?;
    }
    fs::write(output_file, rebuilt)?;
    Ok(applied_rows.len())
  }
}

fn assign_unique_added_hero_ids(
  base_root: &Kv3Value,
  merged_rows: &mut [(String, Kv3Value)],
  added_heroes: Vec<HeroIdRequest>,
) -> Result<(), Error> {
  for reassignment in plan_unique_added_hero_ids(base_root, added_heroes)? {
    let row = object_get_case_insensitive_mut(merged_rows, &reassignment.row_name)
      .expect("selected hero row remains present in the merged root");
    set_compiled_hero_id(row, reassignment.assigned_id)?;
  }
  Ok(())
}

fn default_hero_id_reassignments(
  tables: &[CompiledDataTable],
) -> Result<Vec<HeroIdReassignment>, Error> {
  let mut reassignments = Vec::new();
  for table in tables
    .iter()
    .filter(|table| table.file_path == HEROES_VDATA_PATH)
  {
    let requests = table
      .groups
      .values()
      .filter(|group| !group.existed_in_vanilla)
      .filter_map(|group| {
        let winner = group.candidates.first()?;
        Some(HeroIdRequest {
          row_name: group.row_name.clone(),
          mod_id: winner.candidate.mod_id.clone(),
          priority: winner.candidate.priority,
          requested_id: compiled_hero_id(&winner.value)?,
        })
      })
      .collect();
    reassignments.extend(plan_unique_added_hero_ids(&table.base_root, requests)?);
  }
  Ok(reassignments)
}

fn plan_unique_added_hero_ids(
  base_root: &Kv3Value,
  mut requests: Vec<HeroIdRequest>,
) -> Result<Vec<HeroIdReassignment>, Error> {
  let Kv3Value::Object(base_rows) = base_root else {
    return Err(Error::ModInvalid(
      "Base heroes.vdata root is not an object".to_string(),
    ));
  };
  let mut used_ids = BTreeSet::new();
  for (_, row) in base_rows {
    if let Some(id) = compiled_hero_id(row) {
      used_ids.insert(id);
    }
  }
  let highest_requested = requests
    .iter()
    .map(|request| request.requested_id)
    .chain(used_ids.iter().copied())
    .max()
    .unwrap_or(0);
  let mut next_id = highest_requested.checked_add(1).ok_or_else(|| {
    Error::ModInvalid(
      "Cannot allocate another hero ID because the ID range is exhausted".to_string(),
    )
  })?;
  requests.sort_by(|left, right| {
    left.priority.cmp(&right.priority).then_with(|| {
      left
        .row_name
        .to_ascii_lowercase()
        .cmp(&right.row_name.to_ascii_lowercase())
    })
  });

  let mut reassignments = Vec::new();
  for request in requests {
    if used_ids.insert(request.requested_id) {
      continue;
    }
    while used_ids.contains(&next_id) {
      next_id = next_id.checked_add(1).ok_or_else(|| {
        Error::ModInvalid(
          "Cannot allocate another hero ID because the ID range is exhausted".to_string(),
        )
      })?;
    }
    reassignments.push(HeroIdReassignment {
      row_name: request.row_name,
      mod_id: request.mod_id,
      requested_id: request.requested_id,
      assigned_id: next_id,
    });
    used_ids.insert(next_id);
    next_id = next_id.checked_add(1).ok_or_else(|| {
      Error::ModInvalid(
        "Cannot allocate another hero ID because the ID range is exhausted".to_string(),
      )
    })?;
  }
  Ok(reassignments)
}

fn compiled_hero_id(value: &Kv3Value) -> Option<i64> {
  let Kv3Value::Object(fields) = value else {
    return None;
  };
  object_get_case_insensitive(fields, "m_HeroID").and_then(Kv3Value::as_int)
}

fn set_compiled_hero_id(value: &mut Kv3Value, id: i64) -> Result<(), Error> {
  let Kv3Value::Object(fields) = value else {
    return Err(Error::ModInvalid("Hero row is not an object".to_string()));
  };
  let field = fields
    .iter_mut()
    .find(|(key, _)| key.eq_ignore_ascii_case("m_HeroID"))
    .map(|(_, value)| value)
    .ok_or_else(|| Error::ModInvalid("Hero row has no m_HeroID".to_string()))?;
  match field {
    Kv3Value::Int(value) => *value = id,
    Kv3Value::UInt(value) => {
      *value = u64::try_from(id)
        .map_err(|_| Error::ModInvalid("Hero ID cannot be negative".to_string()))?;
    }
    _ => {
      return Err(Error::ModInvalid(
        "Hero row has a non-numeric m_HeroID".to_string(),
      ));
    }
  }
  Ok(())
}

fn decode_compiled_data(
  bytes: &[u8],
  source: &str,
) -> Result<(kv3::Format, Kv3Value, Kv3Encoding), Error> {
  let resource = Resource::parse(bytes)
    .map_err(|error| Error::ModInvalid(format!("Failed to parse {source}: {error}")))?;
  let data = resource
    .data_block()
    .map_err(|error| Error::ModInvalid(format!("Failed to read {source} DATA block: {error}")))?;
  let format = kv3::Format::from_payload(data)
    .map_err(|error| Error::ModInvalid(format!("Failed to read {source} KV3 format: {error}")))?;
  let (root, encoding) = kv3::decode_preserving(data)
    .map_err(|error| Error::ModInvalid(format!("Failed to decode {source}: {error}")))?;
  Ok((format, root, encoding))
}

fn choose_compiled_winner<'a>(
  group: &'a CompiledDataGroup,
  resolution: Option<&LocalizationResolution>,
) -> Result<Option<&'a CompiledDataCandidateValue>, Error> {
  let Some(resolution) = resolution else {
    return Ok(group.candidates.first());
  };
  if resolution.use_vanilla {
    return Ok(None);
  }
  let Some(mod_id) = resolution.winner_mod_id.as_deref() else {
    return Ok(group.candidates.first());
  };
  group
    .candidates
    .iter()
    .find(|candidate| {
      candidate.candidate.mod_id == mod_id
        && resolution
          .winner_source_vpk
          .as_deref()
          .is_none_or(|source| source == candidate.candidate.source_vpk)
    })
    .map(Some)
    .ok_or_else(|| {
      Error::InvalidInput(format!(
        "Compiled-data resolution for {} no longer matches an enabled mod",
        group.key
      ))
    })
}

fn choose_winner<'a>(
  group: &'a CandidateGroup,
  resolution: Option<&LocalizationResolution>,
) -> Result<Option<&'a LocalizationCandidate>, Error> {
  let Some(resolution) = resolution else {
    return Ok(group.candidates.first());
  };
  if resolution.use_vanilla {
    return Ok(None);
  }
  let Some(mod_id) = resolution.winner_mod_id.as_deref() else {
    return Ok(group.candidates.first());
  };
  let winner = group.candidates.iter().find(|candidate| {
    candidate.mod_id == mod_id
      && resolution
        .winner_source_vpk
        .as_deref()
        .is_none_or(|source| source == candidate.source_vpk)
      && resolution
        .winner_value
        .as_deref()
        .is_none_or(|value| value == candidate.value)
  });
  winner.map(Some).ok_or_else(|| {
    Error::InvalidInput(format!(
      "Localization resolution for {} no longer matches an enabled mod",
      group.key
    ))
  })
}

fn parse_localization_bytes(bytes: &[u8], source: &str) -> Result<ParsedLocalizationFile, Error> {
  let text = std::str::from_utf8(bytes)
    .map_err(|error| Error::ModInvalid(format!("{source} is not UTF-8: {error}")))?;
  let text = text.strip_prefix('\u{feff}').unwrap_or(text);
  let Ok(parsed) = keyvalues_parser::parse(text) else {
    return parse_localization_lines(text, source);
  };
  if !parsed.key.eq_ignore_ascii_case("lang") {
    return Err(Error::ModInvalid(format!(
      "Localization file {source} has root {:?}, expected lang",
      parsed.key
    )));
  }
  let root = parsed
    .value
    .get_obj()
    .ok_or_else(|| Error::ModInvalid(format!("Localization file {source} has no lang object")))?;
  let language = object_string(root, "Language")
    .map(str::to_string)
    .unwrap_or_else(|| infer_language(source));
  let token_object = object_value(root, "Tokens")
    .and_then(Value::get_obj)
    .ok_or_else(|| Error::ModInvalid(format!("Localization file {source} has no Tokens object")))?;
  let tokens = token_object
    .iter()
    .filter_map(|(token, values)| {
      values
        .last()
        .and_then(Value::get_str)
        .map(|value| (token.to_string(), value.to_string()))
    })
    .collect();
  Ok(ParsedLocalizationFile {
    file: LocalizationFile { language, tokens },
    skipped_lines: Vec::new(),
  })
}

fn parse_localization_lines(text: &str, source: &str) -> Result<ParsedLocalizationFile, Error> {
  let mut language = infer_language(source);
  let mut tokens = BTreeMap::new();
  let mut skipped_lines = Vec::new();
  let mut found_tokens = false;
  let mut in_tokens = false;

  for (index, line) in text.lines().enumerate() {
    let line_number = index + 1;
    let trimmed = line.trim();
    if trimmed.is_empty() || trimmed.starts_with("//") {
      continue;
    }

    if !in_tokens {
      match parse_quoted_fields(trimmed) {
        Ok(fields) if fields.len() >= 2 && fields[0].eq_ignore_ascii_case("Language") => {
          language = fields[1].clone();
        }
        Ok(fields) if fields.len() == 1 && fields[0].eq_ignore_ascii_case("Tokens") => {
          found_tokens = true;
        }
        _ => {}
      }
      if found_tokens && trimmed.contains('{') {
        in_tokens = true;
      }
      continue;
    }

    if trimmed.starts_with('}') {
      break;
    }
    match parse_quoted_fields(trimmed) {
      Ok(fields) if fields.len() >= 2 => {
        tokens.insert(fields[0].clone(), fields[1].clone());
      }
      _ => skipped_lines.push(line_number),
    }
  }

  if !found_tokens || !in_tokens {
    return Err(Error::ModInvalid(format!(
      "Localization file {source} has no readable Tokens object"
    )));
  }
  Ok(ParsedLocalizationFile {
    file: LocalizationFile { language, tokens },
    skipped_lines,
  })
}

fn parse_quoted_fields(line: &str) -> Result<Vec<String>, ()> {
  let mut fields = Vec::new();
  let mut chars = line.chars().peekable();

  while let Some(character) = chars.next() {
    if character == '/' && chars.peek() == Some(&'/') {
      break;
    }
    if character != '"' {
      continue;
    }

    let mut field = String::new();
    let mut closed = false;
    while let Some(character) = chars.next() {
      match character {
        '"' => {
          closed = true;
          break;
        }
        '\\' => {
          let escaped = chars.next().ok_or(())?;
          field.push(match escaped {
            'n' => '\n',
            'r' => '\r',
            't' => '\t',
            other => other,
          });
        }
        other => field.push(other),
      }
    }
    if !closed {
      return Err(());
    }
    fields.push(field);
  }

  Ok(fields)
}

fn object_value<'a, 'text>(
  object: &'a keyvalues_parser::Obj<'text>,
  key: &str,
) -> Option<&'a Value<'text>> {
  object
    .iter()
    .find(|(candidate, _)| candidate.eq_ignore_ascii_case(key))
    .and_then(|(_, values)| values.last())
}

fn object_string<'a, 'text>(
  object: &'a keyvalues_parser::Obj<'text>,
  key: &str,
) -> Option<&'a str> {
  object_value(object, key).and_then(Value::get_str)
}

fn render_localization(file: &LocalizationFile) -> Vec<u8> {
  let mut output = String::from("\u{feff}\"lang\"\r\n{\r\n\t\"Language\"\t\t\"");
  output.push_str(&escape_keyvalues(&file.language));
  output.push_str("\"\r\n\t\"Tokens\"\r\n\t{\r\n");
  for (token, value) in &file.tokens {
    output.push_str("\t\t\"");
    output.push_str(&escape_keyvalues(token));
    output.push_str("\"\t\t\"");
    output.push_str(&escape_keyvalues(value));
    output.push_str("\"\r\n");
  }
  output.push_str("\t}\r\n}\r\n");
  output.into_bytes()
}

fn escape_keyvalues(value: &str) -> String {
  value
    .replace('\\', "\\\\")
    .replace('"', "\\\"")
    .replace('\n', "\\n")
    .replace('\r', "\\r")
    .replace('\t', "\\t")
}

fn get_case_insensitive<'a>(tokens: &'a BTreeMap<String, String>, key: &str) -> Option<&'a str> {
  tokens
    .iter()
    .find(|(candidate, _)| candidate.eq_ignore_ascii_case(key))
    .map(|(_, value)| value.as_str())
}

fn set_case_insensitive(tokens: &mut BTreeMap<String, String>, key: &str, value: String) {
  let existing = tokens
    .keys()
    .find(|candidate| candidate.eq_ignore_ascii_case(key))
    .cloned();
  tokens.insert(existing.unwrap_or_else(|| key.to_string()), value);
}

fn object_get_case_insensitive<'a>(
  rows: &'a [(String, Kv3Value)],
  key: &str,
) -> Option<&'a Kv3Value> {
  rows
    .iter()
    .find(|(candidate, _)| candidate.eq_ignore_ascii_case(key))
    .map(|(_, value)| value)
}

fn object_get_case_insensitive_mut<'a>(
  rows: &'a mut [(String, Kv3Value)],
  key: &str,
) -> Option<&'a mut Kv3Value> {
  rows
    .iter_mut()
    .find(|(candidate, _)| candidate.eq_ignore_ascii_case(key))
    .map(|(_, value)| value)
}

fn object_set_case_insensitive(rows: &mut Vec<(String, Kv3Value)>, key: &str, value: Kv3Value) {
  if let Some((_, current)) = rows
    .iter_mut()
    .find(|(candidate, _)| candidate.eq_ignore_ascii_case(key))
  {
    *current = value;
  } else {
    rows.push((key.to_string(), value));
  }
}

fn encoding_get_case_insensitive<'a>(
  fields: &'a [(String, Kv3Encoding)],
  key: &str,
) -> Option<&'a Kv3Encoding> {
  fields
    .iter()
    .find(|(candidate, _)| candidate.eq_ignore_ascii_case(key))
    .map(|(_, encoding)| encoding)
}

fn encoding_get_case_insensitive_mut<'a>(
  fields: &'a mut [(String, Kv3Encoding)],
  key: &str,
) -> Option<&'a mut Kv3Encoding> {
  fields
    .iter_mut()
    .find(|(candidate, _)| candidate.eq_ignore_ascii_case(key))
    .map(|(_, encoding)| encoding)
}

fn encoding_set_case_insensitive(
  fields: &mut Vec<(String, Kv3Encoding)>,
  key: &str,
  encoding: Kv3Encoding,
) {
  if let Some((_, current)) = fields
    .iter_mut()
    .find(|(candidate, _)| candidate.eq_ignore_ascii_case(key))
  {
    *current = encoding;
  } else {
    fields.push((key.to_string(), encoding));
  }
}

fn set_compiled_value_at_path(
  root: &mut Kv3Value,
  path: &[Kv3Seg],
  value: Kv3Value,
) -> Result<(), Error> {
  let Some((segment, remaining)) = path.split_first() else {
    *root = value;
    return Ok(());
  };

  match segment {
    Kv3Seg::Key(key) => {
      let Kv3Value::Object(fields) = root else {
        return Err(Error::ModInvalid(format!(
          "Cannot apply compiled-data field {key}: parent is not an object"
        )));
      };
      if remaining.is_empty() {
        object_set_case_insensitive(fields, key, value);
        return Ok(());
      }
      let field = object_get_case_insensitive_mut(fields, key).ok_or_else(|| {
        Error::ModInvalid(format!(
          "Cannot apply compiled-data field {key}: parent field is missing"
        ))
      })?;
      set_compiled_value_at_path(field, remaining, value)
    }
    Kv3Seg::Index(index) => {
      let Kv3Value::Array(items) = root else {
        return Err(Error::ModInvalid(format!(
          "Cannot apply compiled-data index {index}: parent is not an array"
        )));
      };
      let item_count = items.len();
      let item = items.get_mut(*index).ok_or_else(|| {
        Error::ModInvalid(format!(
          "Cannot apply compiled-data index {index}: array has {} items",
          item_count
        ))
      })?;
      if remaining.is_empty() {
        *item = value;
        Ok(())
      } else {
        set_compiled_value_at_path(item, remaining, value)
      }
    }
  }
}

fn set_compiled_encoding_at_path(
  root: &mut Kv3Encoding,
  path: &[Kv3Seg],
  encoding: Kv3Encoding,
) -> Result<(), Error> {
  let Some((segment, remaining)) = path.split_first() else {
    *root = encoding;
    return Ok(());
  };

  match segment {
    Kv3Seg::Key(key) => {
      let fields = root.as_object_mut().ok_or_else(|| {
        Error::ModInvalid(format!(
          "Cannot apply compiled-data encoding for field {key}: parent is not an object"
        ))
      })?;
      if remaining.is_empty() {
        encoding_set_case_insensitive(fields, key, encoding);
        return Ok(());
      }
      let field = encoding_get_case_insensitive_mut(fields, key).ok_or_else(|| {
        Error::ModInvalid(format!(
          "Cannot apply compiled-data encoding for field {key}: parent field is missing"
        ))
      })?;
      set_compiled_encoding_at_path(field, remaining, encoding)
    }
    Kv3Seg::Index(index) => {
      let items = root.as_array_mut().ok_or_else(|| {
        Error::ModInvalid(format!(
          "Cannot apply compiled-data encoding for index {index}: parent is not an array"
        ))
      })?;
      let item_count = items.len();
      let item = items.get_mut(*index).ok_or_else(|| {
        Error::ModInvalid(format!(
          "Cannot apply compiled-data encoding for index {index}: array has {item_count} items"
        ))
      })?;
      if remaining.is_empty() {
        *item = encoding;
        Ok(())
      } else {
        set_compiled_encoding_at_path(item, remaining, encoding)
      }
    }
  }
}

fn collect_compiled_patches(
  base: &Kv3Value,
  candidate: &Kv3Value,
  candidate_encoding: &Kv3Encoding,
  path: &mut Vec<Kv3Seg>,
  patches: &mut Vec<(Vec<Kv3Seg>, Kv3Value, Kv3Encoding)>,
) -> Result<(), Error> {
  if runtime_values_equal(base, candidate) {
    return Ok(());
  }
  match (base, candidate) {
    (Kv3Value::Object(base_fields), Kv3Value::Object(candidate_fields)) => {
      let candidate_encodings = candidate_encoding.as_object().ok_or_else(|| {
        Error::ModInvalid("Compiled-data object has non-object encoding metadata".to_string())
      })?;
      for (key, candidate_value) in candidate_fields {
        if key.eq_ignore_ascii_case("_editor") {
          continue;
        }
        let field_encoding =
          encoding_get_case_insensitive(candidate_encodings, key).ok_or_else(|| {
            Error::ModInvalid(format!(
              "Compiled-data object has no encoding metadata for field {key}"
            ))
          })?;
        path.push(Kv3Seg::Key(key.clone()));
        if let Some(base_value) = object_get_case_insensitive(base_fields, key) {
          collect_compiled_patches(base_value, candidate_value, field_encoding, path, patches)?;
        } else {
          patches.push((
            path.clone(),
            candidate_value.clone(),
            field_encoding.clone(),
          ));
        }
        path.pop();
      }
    }
    // Array positions are structural rather than stable field identities. A
    // different mod may add, remove, or reorder items, so treating individual
    // indexes as independent patches can apply a value to the wrong item or an
    // index that no longer exists.
    (Kv3Value::Array(_), Kv3Value::Array(_)) => {
      patches.push((path.clone(), candidate.clone(), candidate_encoding.clone()));
    }
    _ => patches.push((path.clone(), candidate.clone(), candidate_encoding.clone())),
  }
  Ok(())
}

fn collect_compiled_fields(
  candidate: &Kv3Value,
  candidate_encoding: &Kv3Encoding,
  path: &mut Vec<Kv3Seg>,
  fields: &mut Vec<(Vec<Kv3Seg>, Kv3Value, Kv3Encoding)>,
) -> Result<(), Error> {
  if let Kv3Value::Object(candidate_fields) = candidate {
    let candidate_encodings = candidate_encoding.as_object().ok_or_else(|| {
      Error::ModInvalid("Compiled-data object has non-object encoding metadata".to_string())
    })?;
    for (key, candidate_value) in candidate_fields {
      if key.eq_ignore_ascii_case("_editor") {
        continue;
      }
      let field_encoding =
        encoding_get_case_insensitive(candidate_encodings, key).ok_or_else(|| {
          Error::ModInvalid(format!(
            "Compiled-data object has no encoding metadata for field {key}"
          ))
        })?;
      path.push(Kv3Seg::Key(key.clone()));
      collect_compiled_fields(candidate_value, field_encoding, path, fields)?;
      path.pop();
    }
  } else {
    fields.push((path.clone(), candidate.clone(), candidate_encoding.clone()));
  }
  Ok(())
}

fn compiled_value_at_path<'a>(root: &'a Kv3Value, path: &[Kv3Seg]) -> Option<&'a Kv3Value> {
  let mut value = root;
  for segment in path {
    value = match segment {
      Kv3Seg::Key(key) => value
        .as_object()
        .and_then(|fields| object_get_case_insensitive(fields, key))?,
      Kv3Seg::Index(index) => value.as_array()?.get(*index)?,
    };
  }
  Some(value)
}

fn compiled_encoding_at_path<'a>(
  root: &'a Kv3Encoding,
  path: &[Kv3Seg],
) -> Option<&'a Kv3Encoding> {
  let mut encoding = root;
  for segment in path {
    encoding = match segment {
      Kv3Seg::Key(key) => encoding
        .as_object()
        .and_then(|fields| encoding_get_case_insensitive(fields, key))?,
      Kv3Seg::Index(index) => encoding.as_array()?.get(*index)?,
    };
  }
  Some(encoding)
}

fn promote_patch_to_applicable_ancestor(
  current: &Kv3Value,
  current_encoding: &Kv3Encoding,
  candidate: &Kv3Value,
  candidate_encoding: &Kv3Encoding,
  patch: (Vec<Kv3Seg>, Kv3Value, Kv3Encoding),
) -> Result<(Vec<Kv3Seg>, Kv3Value, Kv3Encoding), Error> {
  let (path, value, encoding) = patch;
  for prefix_length in 1..path.len() {
    let prefix = &path[..prefix_length];
    let next = &path[prefix_length];
    let value_can_descend = compiled_value_at_path(current, prefix)
      .is_some_and(|value| compiled_value_supports_segment(value, next));
    let encoding_can_descend = compiled_encoding_at_path(current_encoding, prefix)
      .is_some_and(|encoding| compiled_encoding_supports_segment(encoding, next));
    if value_can_descend && encoding_can_descend {
      continue;
    }

    let candidate_value = compiled_value_at_path(candidate, prefix)
      .ok_or_else(|| {
        Error::ModInvalid(format!(
          "Cannot restore missing compiled-data parent {}: candidate value is missing",
          compiled_path_label(prefix)
        ))
      })?
      .clone();
    let candidate_encoding = compiled_encoding_at_path(candidate_encoding, prefix)
      .ok_or_else(|| {
        Error::ModInvalid(format!(
          "Cannot restore missing compiled-data parent {}: candidate encoding is missing",
          compiled_path_label(prefix)
        ))
      })?
      .clone();
    return Ok((prefix.to_vec(), candidate_value, candidate_encoding));
  }
  Ok((path, value, encoding))
}

fn compiled_value_supports_segment(value: &Kv3Value, segment: &Kv3Seg) -> bool {
  matches!(
    (value, segment),
    (Kv3Value::Object(_), Kv3Seg::Key(_)) | (Kv3Value::Array(_), Kv3Seg::Index(_))
  )
}

fn compiled_encoding_supports_segment(encoding: &Kv3Encoding, segment: &Kv3Seg) -> bool {
  match segment {
    Kv3Seg::Key(_) => encoding.as_object().is_some(),
    Kv3Seg::Index(_) => encoding.as_array().is_some(),
  }
}

fn runtime_values_equal(left: &Kv3Value, right: &Kv3Value) -> bool {
  match (left, right) {
    (Kv3Value::Object(left_rows), Kv3Value::Object(right_rows)) => {
      let mut left = left_rows
        .iter()
        .filter(|(key, _)| !key.eq_ignore_ascii_case("_editor"));
      let mut right = right_rows
        .iter()
        .filter(|(key, _)| !key.eq_ignore_ascii_case("_editor"));
      loop {
        match (left.next(), right.next()) {
          (Some((left_key, left_value)), Some((right_key, right_value))) => {
            if !left_key.eq_ignore_ascii_case(right_key)
              || !runtime_values_equal(left_value, right_value)
            {
              return false;
            }
          }
          (None, None) => return true,
          _ => return false,
        }
      }
    }
    (Kv3Value::Array(left), Kv3Value::Array(right)) => {
      left.len() == right.len()
        && left
          .iter()
          .zip(right)
          .all(|(left, right)| runtime_values_equal(left, right))
    }
    _ => left == right,
  }
}

fn conflict_key(file_path: &str, token: &str) -> String {
  format!("{file_path}\u{1f}{}", token.to_ascii_lowercase())
}

fn localization_fingerprint(file_path: &str, token: &str, value: &str) -> [u8; 32] {
  let mut hasher = Sha256::new();
  for part in [
    normalize_path(file_path),
    token.to_ascii_lowercase(),
    value.to_string(),
  ] {
    hasher.update(part.len().to_le_bytes());
    hasher.update(part.as_bytes());
  }
  hasher.finalize().into()
}

fn compiled_conflict_key(file_path: &str, row_name: &str, path: &[Kv3Seg]) -> String {
  let path = path
    .iter()
    .map(|segment| match segment {
      Kv3Seg::Key(key) => format!("k:{}:{key}", key.len()),
      Kv3Seg::Index(index) => format!("i:{index}"),
    })
    .collect::<Vec<_>>()
    .join("/");
  format!(
    "compiled\u{1f}{file_path}\u{1f}{}\u{1f}{path}",
    row_name.to_ascii_lowercase()
  )
}

fn compiled_path_label(path: &[Kv3Seg]) -> String {
  let mut label = String::new();
  for segment in path {
    match segment {
      Kv3Seg::Key(key) => {
        if !label.is_empty() {
          label.push('.');
        }
        label.push_str(key);
      }
      Kv3Seg::Index(index) => {
        label.push('[');
        label.push_str(&index.to_string());
        label.push(']');
      }
    }
  }
  label
}

fn is_localization_path(path: &str) -> bool {
  let normalized = normalize_path(path);
  normalized.starts_with("resource/localization/") && normalized.ends_with(".txt")
}

fn is_protected_localization_path(path: &str) -> bool {
  let normalized = normalize_path(path);
  PROTECTED_LOCALIZATION_PATHS.contains(&normalized.as_str())
}

fn is_mergeable_compiled_data_path(path: &str) -> bool {
  let normalized = normalize_path(path);
  normalized.starts_with("scripts/") && normalized.ends_with(".vdata_c")
}

fn normalize_path(path: &str) -> String {
  path.replace('\\', "/").to_ascii_lowercase()
}

fn infer_language(path: &str) -> String {
  let stem = Path::new(path)
    .file_stem()
    .and_then(|value| value.to_str())
    .unwrap_or("english");
  stem.rsplit('_').next().unwrap_or("english").to_string()
}

#[cfg(test)]
mod tests {
  use super::*;

  const FILE_PATH: &str = "resource/localization/citadel_heroes/citadel_heroes_english.txt";
  const ABILITIES_VDATA_PATH: &str = "scripts/abilities.vdata_c";

  fn localization(tokens: &[(&str, &str)]) -> LocalizationFile {
    LocalizationFile {
      language: "English".to_string(),
      tokens: tokens
        .iter()
        .map(|(token, value)| ((*token).to_string(), (*value).to_string()))
        .collect(),
    }
  }

  fn packed_mod(root: &Path, name: &str, file: &LocalizationFile) -> LocalizationModInput {
    packed_mod_at(root, name, FILE_PATH, file)
  }

  fn packed_mod_at(
    root: &Path,
    name: &str,
    file_path: &str,
    file: &LocalizationFile,
  ) -> LocalizationModInput {
    let source = root.join(format!("{name}-source"));
    let localization_path = source.join(file_path);
    fs::create_dir_all(localization_path.parent().unwrap()).unwrap();
    fs::write(localization_path, render_localization(file)).unwrap();
    let vpk = root.join(format!("{name}_dir.vpk"));
    pack_directory(&source, &vpk).unwrap();
    LocalizationModInput {
      mod_id: name.to_string(),
      vpks: vec![vpk],
    }
  }

  fn compiled_resource(rows: Vec<(String, Kv3Value)>) -> Vec<u8> {
    let payload = kv3::encode(&Kv3Value::Object(rows), &kv3::Format([0; 16]));
    let payload_offset = 32usize;
    let total_len = payload_offset + payload.len();
    let mut bytes = vec![0u8; total_len];
    bytes[0..4].copy_from_slice(&u32::try_from(total_len).unwrap().to_le_bytes());
    bytes[4..6].copy_from_slice(&12u16.to_le_bytes());
    bytes[6..8].copy_from_slice(&0u16.to_le_bytes());
    bytes[8..12].copy_from_slice(&8u32.to_le_bytes());
    bytes[12..16].copy_from_slice(&1u32.to_le_bytes());
    bytes[16..20].copy_from_slice(b"DATA");
    bytes[20..24].copy_from_slice(&12u32.to_le_bytes());
    bytes[24..28].copy_from_slice(&u32::try_from(payload.len()).unwrap().to_le_bytes());
    bytes[payload_offset..].copy_from_slice(&payload);
    bytes
  }

  fn pack_vdata(root: &Path, name: &str, rows: Vec<(String, Kv3Value)>) -> PathBuf {
    pack_vdata_at(root, name, HEROES_VDATA_PATH, rows)
  }

  fn pack_vdata_at(
    root: &Path,
    name: &str,
    file_path: &str,
    rows: Vec<(String, Kv3Value)>,
  ) -> PathBuf {
    let source = root.join(format!("{name}-vdata-source"));
    let vdata_path = source.join(file_path);
    fs::create_dir_all(vdata_path.parent().unwrap()).unwrap();
    fs::write(vdata_path, compiled_resource(rows)).unwrap();
    let output = root.join(format!("{name}_dir.vpk"));
    pack_directory(&source, &output).unwrap();
    output
  }

  fn stat(value: i64) -> Kv3Value {
    Kv3Value::Object(vec![("stamina".to_string(), Kv3Value::Int(value))])
  }

  fn hero(id: i64) -> Kv3Value {
    Kv3Value::Object(vec![("m_HeroID".to_string(), Kv3Value::Int(id))])
  }

  fn hero_id(value: &Kv3Value) -> Option<i64> {
    value.get("m_HeroID").and_then(Kv3Value::as_int)
  }

  fn ability(cooldown: i64, damage: i64) -> Kv3Value {
    Kv3Value::Object(vec![
      ("cooldown".to_string(), Kv3Value::Int(cooldown)),
      ("damage".to_string(), Kv3Value::Int(damage)),
    ])
  }

  fn stale_snapshot_rows(cooldown: i64, stamina: i64) -> Vec<(String, Kv3Value)> {
    let mut rows = vec![
      (
        "ability_celeste".to_string(),
        Kv3Value::Object(vec![("cooldown".to_string(), Kv3Value::Int(cooldown))]),
      ),
      (
        "upgrade_improved_stamina".to_string(),
        Kv3Value::Object(vec![("value".to_string(), Kv3Value::Int(stamina))]),
      ),
    ];
    for index in 0..40 {
      rows.push((format!("unchanged_{index}"), Kv3Value::Int(index)));
    }
    rows
  }

  fn metadata_row(editor: &str) -> Kv3Value {
    Kv3Value::Object(vec![
      ("_editor".to_string(), Kv3Value::String(editor.to_string())),
      ("runtime".to_string(), Kv3Value::Int(1)),
    ])
  }

  #[test]
  fn old_vanilla_localization_values_do_not_replace_the_installed_game() {
    let temp = tempfile::tempdir().unwrap();
    let citadel = temp.path().join("citadel");
    let base_path = citadel.join(FILE_PATH);
    fs::create_dir_all(base_path.parent().unwrap()).unwrap();
    let current = localization(&[("hero_test", "Current hero name")]);
    fs::write(&base_path, render_localization(&current)).unwrap();

    let historical = localization(&[("hero_test", "Old vanilla hero name")]);
    let mut history = HistoricalLocalizationIndex::default();
    history.insert_file(FILE_PATH, &historical);
    let stale_mod = packed_mod(
      temp.path(),
      "stale",
      &localization(&[
        ("hero_test", "Old vanilla hero name"),
        ("hero_custom", "Custom hero name"),
      ]),
    );

    let plan =
      LocalizationOverlayPlan::build_with_history(&citadel, &[stale_mod], &history).unwrap();
    assert_eq!(plan.analysis.changed_tokens, 0);
    assert_eq!(plan.analysis.new_tokens, 1);

    let output = temp.path().join("historical-filter_dir.vpk");
    plan.write(&output, &[]).unwrap();
    let archive = VpkArchive::open(&output).unwrap();
    let merged =
      parse_localization_bytes(&archive.extract_entry(FILE_PATH).unwrap(), "merged").unwrap();
    assert_eq!(
      get_case_insensitive(&merged.file.tokens, "hero_test"),
      Some("Current hero name")
    );
    assert_eq!(
      get_case_insensitive(&merged.file.tokens, "hero_custom"),
      Some("Custom hero name")
    );
  }

  #[test]
  fn embedded_localization_history_index_is_valid_and_populated() {
    assert!(HistoricalLocalizationIndex::embedded().fingerprints.len() > 3_000);
  }

  #[test]
  fn full_vanilla_snapshots_do_not_block_independent_mod_changes() {
    let temp = tempfile::tempdir().unwrap();
    let citadel = temp.path().join("citadel");
    let base_path = citadel.join(FILE_PATH);
    fs::create_dir_all(base_path.parent().unwrap()).unwrap();
    let base = localization(&[
      ("ability_necro_hauntingskull", "Jar of Dead"),
      ("ability_necro_gravestone", "Borrowed Decree"),
    ]);
    fs::write(&base_path, render_localization(&base)).unwrap();

    let guard = packed_mod(temp.path(), "guard", &base);
    let high = packed_mod(
      temp.path(),
      "high",
      &localization(&[
        ("ability_necro_hauntingskull", "Soul Jar"),
        ("ability_necro_gravestone", "Borrowed Decree"),
        ("dmm_high", "High addition"),
      ]),
    );
    let low = packed_mod(
      temp.path(),
      "low",
      &localization(&[
        ("ability_necro_hauntingskull", "Skull Collector"),
        ("ability_necro_gravestone", "Grave Empire"),
        ("dmm_low", "Low addition"),
      ]),
    );

    let plan = LocalizationOverlayPlan::build(&citadel, &[guard, high, low]).unwrap();
    assert_eq!(plan.analysis.ignored_vanilla_tokens, 3);
    assert_eq!(plan.analysis.changed_tokens, 2);
    assert_eq!(plan.analysis.new_tokens, 2);
    assert_eq!(plan.analysis.conflicts.len(), 1);

    let output = temp.path().join("default-overlay_dir.vpk");
    let applied = plan.write(&output, &[]).unwrap();
    assert!(applied.has_overlay);
    assert_eq!(applied.applied_tokens, 4);
    let archive = VpkArchive::open(&output).unwrap();
    let merged =
      parse_localization_bytes(&archive.extract_entry(FILE_PATH).unwrap(), "merged").unwrap();
    assert_eq!(
      get_case_insensitive(&merged.file.tokens, "ability_necro_hauntingskull"),
      Some("Soul Jar")
    );
    assert_eq!(
      get_case_insensitive(&merged.file.tokens, "ability_necro_gravestone"),
      Some("Grave Empire")
    );
    assert_eq!(
      get_case_insensitive(&merged.file.tokens, "dmm_high"),
      Some("High addition")
    );
    assert_eq!(
      get_case_insensitive(&merged.file.tokens, "dmm_low"),
      Some("Low addition")
    );

    let conflict = &plan.analysis.conflicts[0];
    let manual_output = temp.path().join("manual-overlay_dir.vpk");
    plan
      .write(
        &manual_output,
        &[LocalizationResolution {
          conflict_key: conflict.key.clone(),
          winner_mod_id: Some("low".to_string()),
          winner_value: Some("Skull Collector".to_string()),
          winner_source_vpk: None,
          use_vanilla: false,
        }],
      )
      .unwrap();
    let archive = VpkArchive::open(&manual_output).unwrap();
    let merged =
      parse_localization_bytes(&archive.extract_entry(FILE_PATH).unwrap(), "merged").unwrap();
    assert_eq!(
      get_case_insensitive(&merged.file.tokens, "ability_necro_hauntingskull"),
      Some("Skull Collector")
    );
  }

  #[test]
  fn malformed_token_rows_are_skipped_without_discarding_the_file() {
    let bytes = br#""lang"
{
  "Language" "English"
  "Tokens"
  {
    "valid_before" "Before"
    "broken" "This value never closes
    "valid_after" "After"
  }

}
"#;

    let parsed = parse_localization_bytes(bytes, "malformed.txt").unwrap();
    assert_eq!(parsed.skipped_lines, vec![7]);
    assert_eq!(
      parsed.file.tokens.get("valid_before"),
      Some(&"Before".to_string())
    );
    assert_eq!(
      parsed.file.tokens.get("valid_after"),
      Some(&"After".to_string())
    );
    assert!(!parsed.file.tokens.contains_key("broken"));
  }

  #[test]
  fn localization_scan_covers_every_language_and_nested_folder() {
    const FRENCH_PATH: &str =
      "resource/localization/community/custom_heroes/citadel_heroes_french.txt";
    let temp = tempfile::tempdir().unwrap();
    let citadel = temp.path().join("citadel");
    let base_path = citadel.join(FRENCH_PATH);
    fs::create_dir_all(base_path.parent().unwrap()).unwrap();
    let base = LocalizationFile {
      language: "French".to_string(),
      tokens: BTreeMap::from([("hero_name".to_string(), "Héros".to_string())]),
    };
    fs::write(&base_path, render_localization(&base)).unwrap();

    let mod_file = LocalizationFile {
      language: "French".to_string(),
      tokens: BTreeMap::from([
        ("hero_name".to_string(), "Dio".to_string()),
        ("hero_subtitle".to_string(), "Le Monde".to_string()),
      ]),
    };
    let french_mod = packed_mod_at(temp.path(), "french", FRENCH_PATH, &mod_file);
    let plan = LocalizationOverlayPlan::build(&citadel, &[french_mod]).unwrap();
    assert_eq!(plan.analysis.localization_files, 1);
    assert_eq!(plan.analysis.changed_tokens, 1);
    assert_eq!(plan.analysis.new_tokens, 1);

    let output = temp.path().join("french-overlay_dir.vpk");
    plan.write(&output, &[]).unwrap();
    let archive = VpkArchive::open(&output).unwrap();
    let merged =
      parse_localization_bytes(&archive.extract_entry(FRENCH_PATH).unwrap(), "merged").unwrap();
    assert_eq!(merged.file.language, "French");
    assert_eq!(
      merged.file.tokens.get("hero_name"),
      Some(&"Dio".to_string())
    );
    assert_eq!(
      merged.file.tokens.get("hero_subtitle"),
      Some(&"Le Monde".to_string())
    );
  }

  #[test]
  fn independent_compiled_hero_rows_are_packed_into_one_overlay() {
    let temp = tempfile::tempdir().unwrap();
    let citadel = temp.path().join("citadel");
    fs::create_dir_all(&citadel).unwrap();
    let vanilla_rows = vec![
      ("hero_bebop".to_string(), stat(100)),
      (
        "hero_vanilla".to_string(),
        Kv3Value::String("unchanged".to_string()),
      ),
      ("hero_metadata".to_string(), metadata_row("base")),
    ];
    let base_source = temp.path().join("base-source");
    let base_entry = base_source.join(HEROES_VDATA_PATH);
    fs::create_dir_all(base_entry.parent().unwrap()).unwrap();
    fs::write(&base_entry, compiled_resource(vanilla_rows.clone())).unwrap();
    pack_directory(&base_source, &citadel.join("pak01_dir.vpk")).unwrap();

    let calico = pack_vdata(
      temp.path(),
      "calico",
      vec![
        ("hero_bebop".to_string(), stat(90)),
        (
          "hero_vanilla".to_string(),
          Kv3Value::String("unchanged".to_string()),
        ),
        ("hero_metadata".to_string(), metadata_row("calico")),
        (
          "hero_aa".to_string(),
          Kv3Value::String("calico".to_string()),
        ),
      ],
    );
    let dio = pack_vdata(
      temp.path(),
      "dio",
      vec![
        ("hero_bebop".to_string(), stat(90)),
        (
          "hero_vanilla".to_string(),
          Kv3Value::String("unchanged".to_string()),
        ),
        ("hero_metadata".to_string(), metadata_row("dio")),
        ("hero_dio".to_string(), Kv3Value::String("dio".to_string())),
      ],
    );
    let mods = [
      LocalizationModInput {
        mod_id: "calico".to_string(),
        vpks: vec![calico],
      },
      LocalizationModInput {
        mod_id: "dio".to_string(),
        vpks: vec![dio],
      },
    ];

    let plan = LocalizationOverlayPlan::build(&citadel, &mods).unwrap();
    assert_eq!(plan.analysis.compiled_data_files, 2);
    assert_eq!(plan.analysis.ignored_vanilla_rows, 4);
    assert_eq!(plan.analysis.changed_rows, 1);
    assert_eq!(plan.analysis.new_rows, 2);
    assert!(plan.analysis.compiled_data_conflicts.is_empty());

    let output = temp.path().join("merged-overlay_dir.vpk");
    let applied = plan.write(&output, &[]).unwrap();
    assert_eq!(applied.applied_compiled_rows, 3);
    let archive = VpkArchive::open(&output).unwrap();
    let bytes = archive.extract_entry(HEROES_VDATA_PATH).unwrap();
    let (_, root, _) = decode_compiled_data(&bytes, "test overlay").unwrap();
    let Kv3Value::Object(rows) = root else {
      panic!("merged root was not an object");
    };
    assert_eq!(
      object_get_case_insensitive(&rows, "hero_bebop"),
      Some(&stat(90))
    );
    assert_eq!(
      object_get_case_insensitive(&rows, "hero_aa"),
      Some(&Kv3Value::String("calico".to_string()))
    );
    assert_eq!(
      object_get_case_insensitive(&rows, "hero_dio"),
      Some(&Kv3Value::String("dio".to_string()))
    );
    assert_eq!(
      object_get_case_insensitive(&rows, "hero_metadata"),
      Some(&metadata_row("base"))
    );
  }

  #[test]
  fn conflicting_compiled_rows_follow_load_order_or_manual_resolution() {
    let temp = tempfile::tempdir().unwrap();
    let citadel = temp.path().join("citadel");
    fs::create_dir_all(&citadel).unwrap();
    let base_source = temp.path().join("base-source");
    let base_entry = base_source.join(HEROES_VDATA_PATH);
    fs::create_dir_all(base_entry.parent().unwrap()).unwrap();
    fs::write(
      &base_entry,
      compiled_resource(vec![("hero_vanilla".to_string(), stat(100))]),
    )
    .unwrap();
    pack_directory(&base_source, &citadel.join("pak01_dir.vpk")).unwrap();

    let high = pack_vdata(
      temp.path(),
      "high",
      vec![
        ("hero_vanilla".to_string(), stat(100)),
        (
          "hero_custom".to_string(),
          Kv3Value::String("high".to_string()),
        ),
      ],
    );
    let low = pack_vdata(
      temp.path(),
      "low",
      vec![
        ("hero_vanilla".to_string(), stat(100)),
        (
          "hero_custom".to_string(),
          Kv3Value::String("low".to_string()),
        ),
      ],
    );
    let mods = [
      LocalizationModInput {
        mod_id: "high".to_string(),
        vpks: vec![high],
      },
      LocalizationModInput {
        mod_id: "low".to_string(),
        vpks: vec![low],
      },
    ];
    let plan = LocalizationOverlayPlan::build(&citadel, &mods).unwrap();
    assert_eq!(plan.analysis.compiled_data_conflicts.len(), 1);
    let conflict = &plan.analysis.compiled_data_conflicts[0];

    let default_output = temp.path().join("default-conflict_dir.vpk");
    plan.write(&default_output, &[]).unwrap();
    let default_archive = VpkArchive::open(&default_output).unwrap();
    let default_bytes = default_archive.extract_entry(HEROES_VDATA_PATH).unwrap();
    let (_, default_root, _) = decode_compiled_data(&default_bytes, "default conflict").unwrap();
    assert_eq!(
      default_root.get("hero_custom"),
      Some(&Kv3Value::String("high".to_string()))
    );

    let manual_output = temp.path().join("manual-conflict_dir.vpk");
    plan
      .write(
        &manual_output,
        &[LocalizationResolution {
          conflict_key: conflict.key.clone(),
          winner_mod_id: Some("low".to_string()),
          winner_value: None,
          winner_source_vpk: Some("low_dir.vpk".to_string()),
          use_vanilla: false,
        }],
      )
      .unwrap();
    let manual_archive = VpkArchive::open(&manual_output).unwrap();
    let manual_bytes = manual_archive.extract_entry(HEROES_VDATA_PATH).unwrap();
    let (_, manual_root, _) = decode_compiled_data(&manual_bytes, "manual conflict").unwrap();
    assert_eq!(
      manual_root.get("hero_custom"),
      Some(&Kv3Value::String("low".to_string()))
    );
  }

  #[test]
  fn independent_fields_in_one_compiled_row_are_merged() {
    let temp = tempfile::tempdir().unwrap();
    let citadel = temp.path().join("citadel");
    fs::create_dir_all(&citadel).unwrap();
    let base_source = temp.path().join("base-source");
    let base_entry = base_source.join(ABILITIES_VDATA_PATH);
    fs::create_dir_all(base_entry.parent().unwrap()).unwrap();
    fs::write(
      &base_entry,
      compiled_resource(vec![("ability_test".to_string(), ability(10, 100))]),
    )
    .unwrap();
    pack_directory(&base_source, &citadel.join("pak01_dir.vpk")).unwrap();

    let high = pack_vdata_at(
      temp.path(),
      "high",
      ABILITIES_VDATA_PATH,
      vec![("ability_test".to_string(), ability(10, 110))],
    );
    let low = pack_vdata_at(
      temp.path(),
      "low",
      ABILITIES_VDATA_PATH,
      vec![("ability_test".to_string(), ability(0, 100))],
    );
    let mods = [
      LocalizationModInput {
        mod_id: "high".to_string(),
        vpks: vec![high],
      },
      LocalizationModInput {
        mod_id: "low".to_string(),
        vpks: vec![low],
      },
    ];

    let plan = LocalizationOverlayPlan::build(&citadel, &mods).unwrap();
    assert!(plan.analysis.compiled_data_conflicts.is_empty());
    let output = temp.path().join("field-merged_dir.vpk");
    plan.write(&output, &[]).unwrap();
    let archive = VpkArchive::open(&output).unwrap();
    let bytes = archive.extract_entry(ABILITIES_VDATA_PATH).unwrap();
    let (_, root, _) = decode_compiled_data(&bytes, "field merged ability").unwrap();
    let row = root.get("ability_test").unwrap();
    assert_eq!(row.get("cooldown").and_then(Kv3Value::as_int), Some(0));
    assert_eq!(row.get("damage").and_then(Kv3Value::as_int), Some(110));
  }

  #[test]
  fn newly_merged_heroes_receive_unique_ids_in_load_order() {
    let temp = tempfile::tempdir().unwrap();
    let citadel = temp.path().join("citadel");
    fs::create_dir_all(&citadel).unwrap();
    let base_source = temp.path().join("base-source");
    let base_entry = base_source.join(HEROES_VDATA_PATH);
    fs::create_dir_all(base_entry.parent().unwrap()).unwrap();
    fs::write(
      &base_entry,
      compiled_resource(vec![("hero_vanilla".to_string(), hero(100))]),
    )
    .unwrap();
    pack_directory(&base_source, &citadel.join("pak01_dir.vpk")).unwrap();

    let high = pack_vdata(
      temp.path(),
      "high",
      vec![
        ("hero_vanilla".to_string(), hero(100)),
        ("hero_high".to_string(), hero(105)),
      ],
    );
    let low = pack_vdata(
      temp.path(),
      "low",
      vec![
        ("hero_vanilla".to_string(), hero(100)),
        ("hero_low".to_string(), hero(105)),
      ],
    );
    let mods = [
      LocalizationModInput {
        mod_id: "high".to_string(),
        vpks: vec![high],
      },
      LocalizationModInput {
        mod_id: "low".to_string(),
        vpks: vec![low],
      },
    ];

    let plan = LocalizationOverlayPlan::build(&citadel, &mods).unwrap();
    assert_eq!(plan.analysis.hero_id_reassignments.len(), 1);
    let reassignment = &plan.analysis.hero_id_reassignments[0];
    assert_eq!(reassignment.row_name, "hero_low");
    assert_eq!(reassignment.mod_id, "low");
    assert_eq!(reassignment.requested_id, 105);
    assert_eq!(reassignment.assigned_id, 106);
    let output = temp.path().join("unique-hero-ids_dir.vpk");
    plan.write(&output, &[]).unwrap();
    let archive = VpkArchive::open(&output).unwrap();
    let bytes = archive.extract_entry(HEROES_VDATA_PATH).unwrap();
    let (_, root, _) = decode_compiled_data(&bytes, "unique hero IDs").unwrap();

    assert_eq!(root.get("hero_vanilla").and_then(hero_id), Some(100));
    assert_eq!(root.get("hero_high").and_then(hero_id), Some(105));
    assert_eq!(root.get("hero_low").and_then(hero_id), Some(106));
  }

  #[test]
  fn discovers_mergeable_script_data_without_an_allowlist() {
    const BOT_DATA_PATH: &str = "scripts/bots/bot_difficulty.vdata_c";
    let temp = tempfile::tempdir().unwrap();
    let citadel = temp.path().join("citadel");
    fs::create_dir_all(&citadel).unwrap();
    let base_source = temp.path().join("base-source");
    let base_entry = base_source.join(BOT_DATA_PATH);
    fs::create_dir_all(base_entry.parent().unwrap()).unwrap();
    fs::write(
      &base_entry,
      compiled_resource(vec![("easy".to_string(), stat(100))]),
    )
    .unwrap();
    pack_directory(&base_source, &citadel.join("pak01_dir.vpk")).unwrap();

    let bot_mod = pack_vdata_at(
      temp.path(),
      "bot-tuning",
      BOT_DATA_PATH,
      vec![
        ("easy".to_string(), stat(90)),
        ("custom".to_string(), stat(110)),
      ],
    );
    let plan = LocalizationOverlayPlan::build(
      &citadel,
      &[LocalizationModInput {
        mod_id: "bot-tuning".to_string(),
        vpks: vec![bot_mod],
      }],
    )
    .unwrap();
    assert_eq!(plan.analysis.compiled_data_files, 1);
    assert_eq!(plan.analysis.changed_rows, 1);
    assert_eq!(plan.analysis.new_rows, 1);

    let output = temp.path().join("bot-overlay_dir.vpk");
    plan.write(&output, &[]).unwrap();
    let archive = VpkArchive::open(&output).unwrap();
    let bytes = archive.extract_entry(BOT_DATA_PATH).unwrap();
    let (_, root, _) = decode_compiled_data(&bytes, "bot overlay").unwrap();
    assert_eq!(root.get("easy"), Some(&stat(90)));
    assert_eq!(root.get("custom"), Some(&stat(110)));
  }

  #[test]
  fn compiled_arrays_are_resolved_atomically_when_their_shape_changes() {
    fn row(values: &[i64]) -> Kv3Value {
      Kv3Value::Object(vec![(
        "upgrades".to_string(),
        Kv3Value::Array(values.iter().copied().map(Kv3Value::Int).collect()),
      )])
    }

    let temp = tempfile::tempdir().unwrap();
    let citadel = temp.path().join("citadel");
    fs::create_dir_all(&citadel).unwrap();
    let base_source = temp.path().join("base-source");
    let base_entry = base_source.join(ABILITIES_VDATA_PATH);
    fs::create_dir_all(base_entry.parent().unwrap()).unwrap();
    fs::write(
      &base_entry,
      compiled_resource(vec![("ability_test".to_string(), row(&[1, 2, 3, 4, 5]))]),
    )
    .unwrap();
    pack_directory(&base_source, &citadel.join("pak01_dir.vpk")).unwrap();

    let high = pack_vdata_at(
      temp.path(),
      "high",
      ABILITIES_VDATA_PATH,
      vec![("ability_test".to_string(), row(&[1, 2, 3]))],
    );
    let low = pack_vdata_at(
      temp.path(),
      "low",
      ABILITIES_VDATA_PATH,
      vec![("ability_test".to_string(), row(&[1, 2, 3, 4, 9]))],
    );
    let plan = LocalizationOverlayPlan::build(
      &citadel,
      &[
        LocalizationModInput {
          mod_id: "high".to_string(),
          vpks: vec![high],
        },
        LocalizationModInput {
          mod_id: "low".to_string(),
          vpks: vec![low],
        },
      ],
    )
    .unwrap();
    assert_eq!(plan.analysis.compiled_data_conflicts.len(), 1);
    assert_eq!(
      plan.analysis.compiled_data_conflicts[0].field_path,
      "upgrades"
    );

    let output = temp.path().join("atomic-array_dir.vpk");
    plan.write(&output, &[]).unwrap();
    let archive = VpkArchive::open(&output).unwrap();
    let bytes = archive.extract_entry(ABILITIES_VDATA_PATH).unwrap();
    let (_, root, _) = decode_compiled_data(&bytes, "atomic array").unwrap();
    assert_eq!(root.get("ability_test"), Some(&row(&[1, 2, 3])));
  }

  #[test]
  fn rebases_only_intentional_vdata_changes_from_a_historical_snapshot() {
    let file_path = ABILITIES_VDATA_PATH;
    let history_bytes = crate::mod_manager::vdata_history::encode_history_index(&[(
      file_path.to_string(),
      vec![
        (100, Kv3Value::Object(stale_snapshot_rows(30, 1))),
        (101, Kv3Value::Object(stale_snapshot_rows(32, 1))),
        (102, Kv3Value::Object(stale_snapshot_rows(34, 1))),
      ],
    )])
    .unwrap();
    let history = VdataHistoryIndex::from_bytes(&history_bytes).unwrap();
    let table = build_compiled_table(
      file_path,
      compiled_resource(stale_snapshot_rows(34, 1)),
      vec![CompiledDataSource {
        mod_id: "old-snapshot-mod".to_string(),
        source_vpk: "old-snapshot-mod_dir.vpk".to_string(),
        priority: 0,
        bytes: compiled_resource(stale_snapshot_rows(32, 100)),
      }],
      Some(&history),
    )
    .unwrap();

    let temp = tempfile::tempdir().unwrap();
    table.write_to_directory(temp.path(), &[]).unwrap();
    let bytes = fs::read(temp.path().join(file_path)).unwrap();
    let (_, root, _) = decode_compiled_data(&bytes, "rebased test output").unwrap();
    assert_eq!(
      root
        .get("ability_celeste")
        .and_then(|row| row.get("cooldown")),
      Some(&Kv3Value::Int(34))
    );
    assert_eq!(
      root
        .get("upgrade_improved_stamina")
        .and_then(|row| row.get("value")),
      Some(&Kv3Value::Int(100))
    );
  }

  #[test]
  fn restores_an_intentional_subtree_when_the_current_parent_is_missing() {
    let file_path = ABILITIES_VDATA_PATH;
    let mut historical_rows = stale_snapshot_rows(34, 1);
    historical_rows.push((
      "ability_ice_grenade".to_string(),
      Kv3Value::Object(vec![("existing".to_string(), Kv3Value::Int(1))]),
    ));
    let mut mod_rows = historical_rows.clone();
    object_set_case_insensitive(
      &mut mod_rows,
      "ability_ice_grenade",
      Kv3Value::Object(vec![
        ("existing".to_string(), Kv3Value::Int(1)),
        (
          "m_HUDPanel".to_string(),
          Kv3Value::Object(vec![(
            "m_vecHUDElements".to_string(),
            Kv3Value::Array(vec![Kv3Value::String("lockon".to_string())]),
          )]),
        ),
      ]),
    );
    let history_bytes = crate::mod_manager::vdata_history::encode_history_index(&[(
      file_path.to_string(),
      vec![(6640, Kv3Value::Object(historical_rows.clone()))],
    )])
    .unwrap();
    let history = VdataHistoryIndex::from_bytes(&history_bytes).unwrap();
    let table = build_compiled_table(
      file_path,
      compiled_resource(historical_rows),
      vec![CompiledDataSource {
        mod_id: "hud-mod".to_string(),
        source_vpk: "hud-mod_dir.vpk".to_string(),
        priority: 0,
        bytes: compiled_resource(mod_rows),
      }],
      Some(&history),
    )
    .unwrap();

    let temp = tempfile::tempdir().unwrap();
    table.write_to_directory(temp.path(), &[]).unwrap();
    let bytes = fs::read(temp.path().join(file_path)).unwrap();
    let (_, root, _) = decode_compiled_data(&bytes, "restored subtree output").unwrap();
    assert_eq!(
      root
        .get("ability_ice_grenade")
        .and_then(|row| row.get("m_HUDPanel"))
        .and_then(|panel| panel.get("m_vecHUDElements")),
      Some(&Kv3Value::Array(vec![Kv3Value::String(
        "lockon".to_string()
      )]))
    );
  }

  #[test]
  #[ignore = "requires DMM_REAL_CITADEL, DMM_REAL_MODS, and DMM_REAL_OUTPUT"]
  fn inspect_real_mod_overlay() {
    let citadel = PathBuf::from(std::env::var("DMM_REAL_CITADEL").unwrap());
    let mods = std::env::var("DMM_REAL_MODS")
      .unwrap()
      .split(';')
      .map(|spec| {
        let (mod_id, vpk) = spec.split_once('=').unwrap();
        LocalizationModInput {
          mod_id: mod_id.to_string(),
          vpks: vec![PathBuf::from(vpk)],
        }
      })
      .collect::<Vec<_>>();
    let started = std::time::Instant::now();
    let plan = LocalizationOverlayPlan::build(&citadel, &mods).unwrap();
    println!(
      "analysis in {:?}:\n{}",
      started.elapsed(),
      serde_json::to_string_pretty(&plan.analysis).unwrap()
    );
    println!("first new localization tokens:");
    for group in plan
      .groups
      .values()
      .filter(|group| group.vanilla_value.is_none())
      .take(40)
    {
      println!(
        "  {} :: {} ({} candidates)",
        group.file_path,
        group.token,
        group.candidates.len()
      );
    }
    println!("compiled data patches:");
    for table in &plan.compiled_data {
      for group in table.groups.values() {
        println!(
          "  {} :: {}.{} ({} candidates)",
          table.file_path,
          group.row_name,
          compiled_path_label(&group.path),
          group.candidates.len()
        );
      }
    }
    let output = PathBuf::from(std::env::var("DMM_REAL_OUTPUT").unwrap());
    let started = std::time::Instant::now();
    let applied = plan.write(&output, &[]).unwrap();
    println!(
      "applied in {:?}:\n{}",
      started.elapsed(),
      serde_json::to_string_pretty(&applied).unwrap()
    );
  }
}
