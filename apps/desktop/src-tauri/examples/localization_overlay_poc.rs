//! Throwaway localization-overlay proof of concept.
//!
//! This example reads localization files from mod VPKs in load-order priority,
//! diffs them against the loose base-game files, resolves conflicts, and packs
//! the winning strings into one overlay VPK. It deliberately refuses to write
//! into `game/citadel/addons`; production integration must update `.dmm.json`
//! atomically when it installs or removes a generated VPK there.

use std::collections::{BTreeMap, BTreeSet};
use std::env;
use std::error::Error;
use std::fs;
use std::path::{Path, PathBuf};

use clap::{Parser, Subcommand};
use desktop_lib::encode_history_index;
use keyvalues_parser::Value;
use sha2::{Digest, Sha256};
use source2_model::vpk_extract::VpkArchive;
use tempfile::TempDir;
use vpk_parser::VpkParser;
use vpkmanager::pack_directory;
use vpkmanager::source2::kv3::{self, Value as Kv3Value};
use vpkmanager::source2::resource::Resource;

const DEMO_LOCALIZATION_PATH: &str =
  "resource/localization/citadel_heroes/citadel_heroes_english.txt";
const PROTECTED_LOCALIZATION_PATHS: [&str; 2] = [
  "resource/localization/citadel_gc_hero_names/citadel_gc_hero_names_english.txt",
  "resource/localization/citadel_heroes/citadel_heroes_english.txt",
];

type PocResult<T> = Result<T, Box<dyn Error>>;

#[derive(Parser)]
#[command(about = "Build a throwaway merged localization overlay VPK")]
struct Cli {
  #[command(subcommand)]
  command: Command,
}

#[derive(Subcommand)]
enum Command {
  /// Create two synthetic mod VPKs, merge them, and print the conflict report.
  Demo {
    /// Deadlock's `game/citadel` directory containing loose localization files.
    #[arg(long)]
    game_citadel: PathBuf,

    /// Output VPK path. It must not be inside `game/citadel/addons`.
    #[arg(long)]
    output: PathBuf,

    /// Prefer this mod when it participates in a conflict.
    #[arg(long)]
    prefer_mod: Option<String>,
  },

  /// Merge real mod VPKs supplied from highest to lowest load-order priority.
  Merge {
    /// Deadlock's `game/citadel` directory containing loose localization files.
    #[arg(long)]
    game_citadel: PathBuf,

    /// `NAME=PATH` mod VPK, repeated from highest to lowest priority.
    #[arg(long = "mod-vpk", value_parser = parse_mod_spec, required = true)]
    mods: Vec<ModSpec>,

    /// Output VPK path. It must not be inside `game/citadel/addons`.
    #[arg(long)]
    output: PathBuf,

    /// Prefer this mod when it participates in a conflict.
    #[arg(long)]
    prefer_mod: Option<String>,
  },

  /// Print a line range from one text entry for compatibility debugging.
  Inspect {
    #[arg(long)]
    vpk: PathBuf,

    #[arg(long)]
    entry: String,

    #[arg(long)]
    from: usize,

    #[arg(long)]
    to: usize,
  },

  /// List VPK entry paths containing a case-insensitive substring.
  List {
    #[arg(long)]
    vpk: PathBuf,

    #[arg(long)]
    contains: String,
  },

  /// Print the SHA-256 hash of one VPK entry.
  EntryHash {
    #[arg(long)]
    vpk: PathBuf,

    #[arg(long)]
    entry: String,
  },

  /// Fail when load order shadows distinct versions of one shared VPK entry.
  ShadowCheck {
    #[arg(long = "mod-vpk", value_parser = parse_mod_spec, required = true)]
    mods: Vec<ModSpec>,

    #[arg(long)]
    entry: String,
  },

  /// Merge distinct top-level rows from compiled Source 2 KV3 tables.
  VdataMerge {
    /// Base game VPK containing the vanilla compiled table.
    #[arg(long)]
    base_vpk: PathBuf,

    /// `NAME=PATH` mod VPK, repeated from highest to lowest priority.
    #[arg(long = "mod-vpk", value_parser = parse_mod_spec, required = true)]
    mods: Vec<ModSpec>,

    /// Compiled table entry to merge.
    #[arg(long, default_value = "scripts/heroes.vdata_c")]
    entry: String,

    /// Output path for the rebuilt compiled resource.
    #[arg(long)]
    output: PathBuf,
  },

  /// Inspect one top-level row in a compiled Source 2 KV3 table.
  VdataInspect {
    #[arg(long)]
    vpk: PathBuf,

    #[arg(long, default_value = "scripts/heroes.vdata_c")]
    entry: String,

    #[arg(long)]
    row: String,
  },

  /// Decode a compiled Source 2 KV3 table to a readable text file.
  VdataDump {
    #[arg(long)]
    vpk: PathBuf,

    #[arg(long)]
    entry: String,

    #[arg(long)]
    output: PathBuf,
  },

  /// Compare top-level rows in two compiled Source 2 KV3 tables.
  VdataDistance {
    #[arg(long)]
    baseline_vpk: PathBuf,

    #[arg(long)]
    candidate_vpk: PathBuf,

    #[arg(long)]
    entry: String,
  },

  /// Classify candidate field changes that match known historical game values.
  VdataHistoryClassify {
    #[arg(long)]
    current_vpk: PathBuf,

    #[arg(long)]
    candidate_vpk: PathBuf,

    #[arg(long)]
    history_dir: PathBuf,

    #[arg(long)]
    entry: String,
  },

  /// Build a compact stale-localization fingerprint index from historical guard VPKs.
  LocalizationHistoryIndex {
    #[arg(long)]
    vpk_dir: PathBuf,

    #[arg(long)]
    output: PathBuf,
  },

  /// Build the compact historical ancestor index used by the VData three-way merge.
  VdataHistoryIndex {
    #[arg(long)]
    vpk_dir: PathBuf,

    #[arg(long)]
    output: PathBuf,
  },

  /// Verify that a rebuilt table retains engine-significant KV3 encodings.
  VdataEncodingCheck {
    #[arg(long)]
    source_vpk: PathBuf,

    #[arg(long)]
    rebuilt_vpk: PathBuf,

    #[arg(long)]
    entry: String,
  },
}

#[derive(Clone, Debug)]
struct ModSpec {
  name: String,
  path: PathBuf,
}

#[derive(Clone, Debug)]
struct LocalizationFile {
  language: String,
  tokens: BTreeMap<String, String>,
}

#[derive(Clone, Debug)]
struct Candidate {
  mod_name: String,
  file_path: String,
  token: String,
  value: String,
  is_new: bool,
}

#[derive(Clone, Debug)]
struct VdataCandidate {
  mod_name: String,
  row_name: String,
  value: Kv3Value,
  is_new: bool,
}

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
struct TokenKey {
  file_path: String,
  token: String,
}

#[derive(Default)]
struct MergeReport {
  localization_files: usize,
  ignored_vanilla_values: usize,
  proposals: usize,
  conflicts: usize,
  additions: usize,
  replacements: usize,
}

fn main() -> PocResult<()> {
  let cli = Cli::parse();
  match cli.command {
    Command::Demo {
      game_citadel,
      output,
      prefer_mod,
    } => {
      let fixtures = TempDir::new()?;
      let mods = create_demo_mods(fixtures.path(), &game_citadel)?;
      println!(
        "Created synthetic fixtures in {}",
        fixtures.path().display()
      );
      build_overlay(&game_citadel, &mods, &output, prefer_mod.as_deref())?;
    }
    Command::Merge {
      game_citadel,
      mods,
      output,
      prefer_mod,
    } => build_overlay(&game_citadel, &mods, &output, prefer_mod.as_deref())?,
    Command::Inspect {
      vpk,
      entry,
      from,
      to,
    } => {
      let archive = VpkArchive::open(&vpk)?;
      let bytes = archive.extract_entry(&entry)?;
      let text = std::str::from_utf8(&bytes)?;
      for (index, line) in text.lines().enumerate() {
        let line_number = index + 1;
        if (from..=to).contains(&line_number) {
          println!("{line_number:>5}: {line}");
        }
      }
    }
    Command::List { vpk, contains } => {
      let archive = VpkArchive::open(&vpk)?;
      let needle = contains.to_ascii_lowercase();
      for entry in archive.list_entries() {
        if entry.to_ascii_lowercase().contains(&needle) {
          println!("{entry}");
        }
      }
    }
    Command::EntryHash { vpk, entry } => {
      let archive = VpkArchive::open(&vpk)?;
      let bytes = archive.extract_entry(&entry)?;
      println!("{:x}", Sha256::digest(bytes));
    }
    Command::ShadowCheck { mods, entry } => {
      let mut candidates: Vec<(String, Vec<u8>)> = Vec::new();
      for mod_spec in mods {
        let archive = VpkArchive::open(&mod_spec.path)?;
        if archive
          .list_entries()
          .iter()
          .any(|candidate| normalized_path(candidate) == normalized_path(&entry))
        {
          candidates.push((mod_spec.name, archive.extract_entry(&entry)?));
        }
      }
      let distinct = candidates
        .iter()
        .enumerate()
        .filter(|(index, (_, bytes))| {
          candidates[..*index]
            .iter()
            .all(|(_, previous)| previous != bytes)
        })
        .count();
      println!("entry: {entry}");
      println!(
        "candidates: {}",
        candidates
          .iter()
          .map(|(name, bytes)| format!("{name} ({} bytes)", bytes.len()))
          .collect::<Vec<_>>()
          .join(", ")
      );
      if distinct > 1 {
        let winner = &candidates[0].0;
        return Err(
          format!("SHADOWED: {distinct} distinct versions; Source 2 loads only {winner}'s {entry}")
            .into(),
        );
      }
      println!("PASS: no distinct shared entry is shadowed");
    }
    Command::VdataMerge {
      base_vpk,
      mods,
      entry,
      output,
    } => merge_vdata(&base_vpk, &mods, &entry, &output)?,
    Command::VdataInspect { vpk, entry, row } => {
      let archive = VpkArchive::open(&vpk)?;
      let bytes = archive.extract_entry(&entry)?;
      let (_, root) = decode_vdata(&bytes)?;
      let Kv3Value::Object(rows) = root else {
        return Err(format!("{entry} root is not an object").into());
      };
      if row == "*" {
        for (row_name, value) in rows {
          let hero_id = value
            .get("m_HeroID")
            .and_then(Kv3Value::as_int)
            .map(|value| value.to_string())
            .unwrap_or_else(|| "?".to_string());
          println!("{hero_id}\t{row_name}");
        }
        return Ok(());
      }
      let value = object_get_case_insensitive(&rows, &row)
        .ok_or_else(|| format!("{entry} has no row {row}"))?;
      println!("{row} = {value:#?}");
    }
    Command::VdataDump { vpk, entry, output } => {
      let archive = VpkArchive::open(&vpk)?;
      let bytes = archive.extract_entry(&entry)?;
      let (_, root) = decode_vdata(&bytes)?;
      let mut dump = String::new();
      render_kv3_value(&root, 0, &mut dump);
      dump.push('\n');
      if let Some(parent) = output.parent() {
        fs::create_dir_all(parent)?;
      }
      fs::write(&output, dump)?;
      println!(
        "dumped {entry} from {} to {}",
        vpk.display(),
        output.display()
      );
    }
    Command::VdataDistance {
      baseline_vpk,
      candidate_vpk,
      entry,
    } => {
      let baseline_archive = VpkArchive::open(&baseline_vpk)?;
      let candidate_archive = VpkArchive::open(&candidate_vpk)?;
      let (_, baseline) = decode_vdata(&baseline_archive.extract_entry(&entry)?)?;
      let (_, candidate) = decode_vdata(&candidate_archive.extract_entry(&entry)?)?;
      let (Kv3Value::Object(baseline_rows), Kv3Value::Object(candidate_rows)) =
        (baseline, candidate)
      else {
        return Err(format!("{entry} root is not an object").into());
      };
      let equal = candidate_rows
        .iter()
        .filter(|(name, value)| {
          object_get_case_insensitive(&baseline_rows, name)
            .is_some_and(|baseline| runtime_values_equal(baseline, value))
        })
        .count();
      let changed = candidate_rows
        .iter()
        .filter(|(name, value)| {
          object_get_case_insensitive(&baseline_rows, name)
            .is_some_and(|baseline| !runtime_values_equal(baseline, value))
        })
        .count();
      let normalized_changed = candidate_rows
        .iter()
        .filter(|(name, value)| {
          object_get_case_insensitive(&baseline_rows, name)
            .is_some_and(|baseline| !runtime_values_nearly_equal(baseline, value))
        })
        .count();
      let candidate_only = candidate_rows
        .iter()
        .filter(|(name, _)| object_get_case_insensitive(&baseline_rows, name).is_none())
        .count();
      let baseline_only = baseline_rows
        .iter()
        .filter(|(name, _)| object_get_case_insensitive(&candidate_rows, name).is_none())
        .count();
      println!(
        "equal={equal}\tchanged={changed}\tnormalized_changed={normalized_changed}\tcandidate_only={candidate_only}\tbaseline_only={baseline_only}"
      );
    }
    Command::VdataHistoryClassify {
      current_vpk,
      candidate_vpk,
      history_dir,
      entry,
    } => {
      classify_vdata_history(&current_vpk, &candidate_vpk, &history_dir, &entry)?;
    }
    Command::LocalizationHistoryIndex { vpk_dir, output } => {
      build_localization_history_index(&vpk_dir, &output)?;
    }
    Command::VdataHistoryIndex { vpk_dir, output } => {
      build_vdata_history_index(&vpk_dir, &output)?;
    }
    Command::VdataEncodingCheck {
      source_vpk,
      rebuilt_vpk,
      entry,
    } => {
      let source_archive = VpkArchive::open(&source_vpk)?;
      let rebuilt_archive = VpkArchive::open(&rebuilt_vpk)?;
      let source_bytes = source_archive.extract_entry(&entry)?;
      let rebuilt_bytes = rebuilt_archive.extract_entry(&entry)?;
      let source_resource = Resource::parse(&source_bytes)?;
      let rebuilt_resource = Resource::parse(&rebuilt_bytes)?;
      let source = kv3::encoding_stats(source_resource.data_block()?)?;
      let rebuilt = kv3::encoding_stats(rebuilt_resource.data_block()?)?;
      println!("source:  {source:?}");
      println!("rebuilt: {rebuilt:?}");
      if source.flagged_nodes > 0 && rebuilt.flagged_nodes == 0 {
        return Err("FAILED: rebuilt table dropped every KV3 value flag".into());
      }
      if source.typed_arrays > 0 && rebuilt.typed_arrays == 0 {
        return Err("FAILED: rebuilt table flattened every typed KV3 array".into());
      }
      if source.narrow_numbers > 0 && rebuilt.narrow_numbers == 0 {
        return Err("FAILED: rebuilt table widened every typed KV3 number".into());
      }
      println!("PASS: engine-significant KV3 encodings remain present");
    }
  }
  Ok(())
}

fn build_localization_history_index(vpk_dir: &Path, output: &Path) -> PocResult<()> {
  let mut vpk_paths = fs::read_dir(vpk_dir)?
    .filter_map(Result::ok)
    .map(|entry| entry.path())
    .filter(|path| path.extension().is_some_and(|extension| extension == "vpk"))
    .collect::<Vec<_>>();
  vpk_paths.sort();

  let mut fingerprints = BTreeSet::new();
  let mut scanned_files = 0usize;
  for vpk_path in &vpk_paths {
    let archive = VpkArchive::open(vpk_path)?;
    let entries = archive
      .list_entries()
      .into_iter()
      .map(|path| (normalized_path(&path), path))
      .collect::<BTreeMap<_, _>>();
    for file_path in PROTECTED_LOCALIZATION_PATHS {
      let Some(entry_path) = entries.get(file_path) else {
        continue;
      };
      let localization = parse_localization_bytes(
        &archive.extract_entry(entry_path)?,
        &format!("{}:{entry_path}", vpk_path.display()),
      )?;
      scanned_files += 1;
      for (token, value) in localization.tokens {
        fingerprints.insert(localization_fingerprint(file_path, &token, &value));
      }
    }
  }

  let mut encoded = Vec::with_capacity(12 + fingerprints.len() * 32);
  encoded.extend_from_slice(b"DMMLOC01");
  encoded.extend_from_slice(&u32::try_from(fingerprints.len())?.to_le_bytes());
  for fingerprint in &fingerprints {
    encoded.extend_from_slice(fingerprint);
  }
  if let Some(parent) = output.parent() {
    fs::create_dir_all(parent)?;
  }
  fs::write(output, encoded)?;
  println!(
    "Wrote {} fingerprints from {} files across {} VPKs",
    fingerprints.len(),
    scanned_files,
    vpk_paths.len()
  );
  Ok(())
}

fn localization_fingerprint(file_path: &str, token: &str, value: &str) -> [u8; 32] {
  let mut hasher = Sha256::new();
  for part in [
    normalized_path(file_path),
    token.to_ascii_lowercase(),
    value.to_string(),
  ] {
    hasher.update(part.len().to_le_bytes());
    hasher.update(part.as_bytes());
  }
  hasher.finalize().into()
}

fn render_kv3_value(value: &Kv3Value, indent: usize, output: &mut String) {
  match value {
    Kv3Value::Null => output.push_str("null"),
    Kv3Value::Bool(value) => output.push_str(if *value { "true" } else { "false" }),
    Kv3Value::Int(value) => output.push_str(&value.to_string()),
    Kv3Value::UInt(value) => output.push_str(&value.to_string()),
    Kv3Value::Double(value) => output.push_str(&format!("{value:?}")),
    Kv3Value::String(value) => {
      output.push_str(&serde_json::to_string(value).expect("serializing a string cannot fail"));
    }
    Kv3Value::Binary(bytes) => {
      output.push_str("binary(");
      for byte in bytes {
        output.push_str(&format!("{byte:02x}"));
      }
      output.push(')');
    }
    Kv3Value::Array(values) => {
      output.push_str("[\n");
      for value in values {
        output.push_str(&"  ".repeat(indent + 1));
        render_kv3_value(value, indent + 1, output);
        output.push_str(",\n");
      }
      output.push_str(&"  ".repeat(indent));
      output.push(']');
    }
    Kv3Value::Object(entries) => {
      output.push_str("{\n");
      for (key, value) in entries {
        output.push_str(&"  ".repeat(indent + 1));
        output.push_str(&serde_json::to_string(key).expect("serializing a string cannot fail"));
        output.push_str(" = ");
        render_kv3_value(value, indent + 1, output);
        output.push('\n');
      }
      output.push_str(&"  ".repeat(indent));
      output.push('}');
    }
  }
}

fn decode_vdata(bytes: &[u8]) -> PocResult<(kv3::Format, Kv3Value)> {
  let resource = Resource::parse(bytes)?;
  let data = resource.data_block()?;
  Ok((kv3::Format::from_payload(data)?, kv3::decode(data)?))
}

fn merge_vdata(base_vpk: &Path, mods: &[ModSpec], entry: &str, output: &Path) -> PocResult<()> {
  let base_archive = VpkArchive::open(base_vpk)?;
  let base_bytes = base_archive.extract_entry(entry)?;
  let (format, base_root) = decode_vdata(&base_bytes)?;
  let Kv3Value::Object(base_rows) = &base_root else {
    return Err(format!("{entry} vanilla root is not a KV3 object").into());
  };
  let base_row_count = base_rows.len();

  let mut candidates: BTreeMap<String, Vec<VdataCandidate>> = BTreeMap::new();
  for mod_spec in mods {
    let archive = VpkArchive::open(&mod_spec.path)?;
    let Some(mod_entry) = archive
      .list_entries()
      .into_iter()
      .find(|candidate| normalized_path(candidate) == normalized_path(entry))
    else {
      println!("{}: does not contain {entry}", mod_spec.name);
      continue;
    };
    let mod_bytes = archive.extract_entry(&mod_entry)?;
    let (_, mod_root) = decode_vdata(&mod_bytes)?;
    let Kv3Value::Object(mod_rows) = mod_root else {
      return Err(format!("{}:{entry} root is not a KV3 object", mod_spec.name).into());
    };

    let mut proposed = Vec::new();
    for (row_name, value) in mod_rows {
      let base_value = object_get_case_insensitive(base_rows, &row_name);
      if base_value.is_some_and(|base| runtime_values_equal(base, &value)) {
        continue;
      }
      if let Some(base_value) = base_value {
        let mut paths = Vec::new();
        collect_changed_paths(base_value, &value, "", &mut paths);
        println!("  {row_name} differs at: {}", paths.join(", "));
      }
      proposed.push(row_name.clone());
      candidates
        .entry(row_name.to_ascii_lowercase())
        .or_default()
        .push(VdataCandidate {
          mod_name: mod_spec.name.clone(),
          row_name,
          value,
          is_new: base_value.is_none(),
        });
    }
    println!(
      "{}: {} changed/new rows: {}",
      mod_spec.name,
      proposed.len(),
      proposed.join(", ")
    );
  }

  let mut merged_root = base_root;
  let Kv3Value::Object(merged_rows) = &mut merged_root else {
    unreachable!("base root checked above");
  };
  let mut conflicts = 0usize;
  let mut additions = 0usize;
  let mut replacements = 0usize;
  for group in candidates.values() {
    let winner = &group[0];
    let mut distinct_values: Vec<&Kv3Value> = Vec::new();
    for candidate in group {
      if !distinct_values
        .iter()
        .any(|value| runtime_values_equal(value, &candidate.value))
      {
        distinct_values.push(&candidate.value);
      }
    }
    if distinct_values.len() > 1 {
      conflicts += 1;
      println!("CONFLICT {} (winner: {})", winner.row_name, winner.mod_name);
      for candidate in group {
        println!("  candidate: {}", candidate.mod_name);
      }
    }
    if winner.is_new {
      additions += 1;
    } else {
      replacements += 1;
    }
    object_set_case_insensitive(merged_rows, &winner.row_name, winner.value.clone());
  }

  let new_data = kv3::encode(&merged_root, &format);
  let rebuilt = Resource::parse(&base_bytes)?.rebuild_with_data(&new_data)?;
  if let Some(parent) = output.parent() {
    fs::create_dir_all(parent)?;
  }
  fs::write(output, &rebuilt)?;

  let (_, verified) = decode_vdata(&rebuilt)?;
  let Kv3Value::Object(verified_rows) = verified else {
    return Err("rebuilt vdata root is not a KV3 object".into());
  };
  for group in candidates.values() {
    let winner = &group[0];
    if object_get_case_insensitive(&verified_rows, &winner.row_name) != Some(&winner.value) {
      return Err(format!("rebuilt vdata lost row {}", winner.row_name).into());
    }
  }

  println!("output: {}", output.display());
  println!("base rows: {base_row_count}");
  println!("merged rows: {}", verified_rows.len());
  println!("additions: {additions}");
  println!("replacements: {replacements}");
  println!("conflicts: {conflicts}");
  println!("PASS: rebuilt resource reparsed with every winning row");
  Ok(())
}

fn collect_changed_paths(
  base: &Kv3Value,
  modified: &Kv3Value,
  prefix: &str,
  output: &mut Vec<String>,
) {
  if output.len() >= 20 {
    return;
  }
  match (base, modified) {
    (Kv3Value::Object(base_rows), Kv3Value::Object(modified_rows)) => {
      let keys = base_rows
        .iter()
        .chain(modified_rows)
        .map(|(key, _)| key.to_ascii_lowercase())
        .collect::<BTreeSet<_>>();
      for key in keys {
        if key == "_editor" {
          continue;
        }
        let path = if prefix.is_empty() {
          key.clone()
        } else {
          format!("{prefix}.{key}")
        };
        match (
          object_get_case_insensitive(base_rows, &key),
          object_get_case_insensitive(modified_rows, &key),
        ) {
          (Some(left), Some(right)) => collect_changed_paths(left, right, &path, output),
          _ => output.push(path),
        }
      }
    }
    _ if base != modified => output.push(prefix.to_string()),
    _ => {}
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

#[derive(Debug)]
struct HistoricalVdataPatch {
  row_name: String,
  path: Vec<String>,
  value: Kv3Value,
  matching_snapshots: usize,
  first_match: Option<String>,
}

fn classify_vdata_history(
  current_vpk: &Path,
  candidate_vpk: &Path,
  history_dir: &Path,
  entry: &str,
) -> PocResult<()> {
  let current_archive = VpkArchive::open(current_vpk)?;
  let candidate_archive = VpkArchive::open(candidate_vpk)?;
  let (_, current_root) = decode_vdata(&current_archive.extract_entry(entry)?)?;
  let (_, candidate_root) = decode_vdata(&candidate_archive.extract_entry(entry)?)?;
  let (Kv3Value::Object(current_rows), Kv3Value::Object(candidate_rows)) =
    (current_root, candidate_root)
  else {
    return Err(format!("{entry} root is not an object").into());
  };

  let mut patches = Vec::new();
  for (row_name, candidate_row) in &candidate_rows {
    let Some(current_row) = object_get_case_insensitive(&current_rows, row_name) else {
      continue;
    };
    let mut row_patches = Vec::new();
    collect_historical_vdata_patches(
      current_row,
      candidate_row,
      &mut Vec::new(),
      &mut row_patches,
    );
    patches.extend(
      row_patches
        .into_iter()
        .map(|(path, value)| HistoricalVdataPatch {
          row_name: row_name.clone(),
          path,
          value,
          matching_snapshots: 0,
          first_match: None,
        }),
    );
  }

  let mut history_paths = fs::read_dir(history_dir)?
    .filter_map(Result::ok)
    .map(|entry| entry.path())
    .filter(|path| path.extension().is_some_and(|extension| extension == "vpk"))
    .collect::<Vec<_>>();
  history_paths.sort();
  let mut scanned = 0usize;
  for history_path in history_paths {
    let Ok(archive) = VpkArchive::open(&history_path) else {
      continue;
    };
    let Ok(bytes) = archive.extract_entry(entry) else {
      continue;
    };
    let Ok((_, Kv3Value::Object(history_rows))) = decode_vdata(&bytes) else {
      continue;
    };
    scanned += 1;
    for patch in &mut patches {
      let Some(history_row) = object_get_case_insensitive(&history_rows, &patch.row_name) else {
        continue;
      };
      if value_at_key_path(history_row, &patch.path)
        .is_some_and(|value| runtime_values_nearly_equal(value, &patch.value))
      {
        patch.matching_snapshots += 1;
        if patch.first_match.is_none() {
          patch.first_match = history_path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned());
        }
      }
    }
  }

  patches.sort_by(|left, right| {
    left
      .row_name
      .cmp(&right.row_name)
      .then_with(|| left.path.cmp(&right.path))
  });
  for patch in &patches {
    println!(
      "{}\t{}\t{}\thistorical={}\tfirst={}",
      patch.row_name,
      patch.path.join("."),
      compact_kv3_value(&patch.value),
      patch.matching_snapshots,
      patch.first_match.as_deref().unwrap_or("-")
    );
  }
  let historical = patches
    .iter()
    .filter(|patch| patch.matching_snapshots > 0)
    .count();
  println!(
    "summary: snapshots={scanned} patches={} historical={historical} novel={}",
    patches.len(),
    patches.len() - historical
  );
  Ok(())
}

fn build_vdata_history_index(vpk_dir: &Path, output: &Path) -> PocResult<()> {
  const TABLE_PATHS: [&str; 2] = ["scripts/abilities.vdata_c", "scripts/heroes.vdata_c"];
  let mut history_paths = fs::read_dir(vpk_dir)?
    .filter_map(Result::ok)
    .filter_map(|entry| {
      let path = entry.path();
      let version = path
        .file_stem()?
        .to_str()?
        .strip_prefix('v')?
        .parse::<u32>()
        .ok()?;
      (path.extension().is_some_and(|extension| extension == "vpk")).then_some((version, path))
    })
    .collect::<Vec<_>>();
  history_paths.sort_by_key(|(version, _)| *version);

  let mut tables = TABLE_PATHS
    .iter()
    .map(|path| ((*path).to_string(), Vec::new()))
    .collect::<Vec<_>>();
  for (version, path) in history_paths {
    let archive = VpkArchive::open(&path)?;
    for (table_path, snapshots) in &mut tables {
      let Ok(bytes) = archive.extract_entry(table_path) else {
        continue;
      };
      let (_, root) = decode_vdata(&bytes)?;
      snapshots.push((version, root));
    }
  }
  for (path, snapshots) in &tables {
    println!("{path}: {} historical builds", snapshots.len());
  }
  let bytes = encode_history_index(&tables)?;
  if let Some(parent) = output.parent() {
    fs::create_dir_all(parent)?;
  }
  fs::write(output, &bytes)?;
  println!("wrote {} bytes to {}", bytes.len(), output.display());
  Ok(())
}

fn collect_historical_vdata_patches(
  current: &Kv3Value,
  candidate: &Kv3Value,
  path: &mut Vec<String>,
  patches: &mut Vec<(Vec<String>, Kv3Value)>,
) {
  if runtime_values_nearly_equal(current, candidate) {
    return;
  }
  match (current, candidate) {
    (Kv3Value::Object(current_fields), Kv3Value::Object(candidate_fields)) => {
      for (key, candidate_value) in candidate_fields {
        if key.eq_ignore_ascii_case("_editor") {
          continue;
        }
        path.push(key.clone());
        if let Some(current_value) = object_get_case_insensitive(current_fields, key) {
          collect_historical_vdata_patches(current_value, candidate_value, path, patches);
        } else {
          patches.push((path.clone(), candidate_value.clone()));
        }
        path.pop();
      }
    }
    (Kv3Value::Array(_), Kv3Value::Array(_)) => {
      patches.push((path.clone(), candidate.clone()));
    }
    _ => patches.push((path.clone(), candidate.clone())),
  }
}

fn value_at_key_path<'a>(root: &'a Kv3Value, path: &[String]) -> Option<&'a Kv3Value> {
  path.iter().try_fold(root, |value, key| {
    let Kv3Value::Object(fields) = value else {
      return None;
    };
    object_get_case_insensitive(fields, key)
  })
}

fn runtime_values_nearly_equal(left: &Kv3Value, right: &Kv3Value) -> bool {
  match (left, right) {
    (Kv3Value::Double(left), Kv3Value::Double(right)) => {
      let scale = left.abs().max(right.abs()).max(1.0);
      (left - right).abs() <= scale * 1.0e-6
    }
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
              || !runtime_values_nearly_equal(left_value, right_value)
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
          .all(|(left, right)| runtime_values_nearly_equal(left, right))
    }
    _ => left == right,
  }
}

fn compact_kv3_value(value: &Kv3Value) -> String {
  match value {
    Kv3Value::Null => "null".to_string(),
    Kv3Value::Bool(value) => value.to_string(),
    Kv3Value::Int(value) => value.to_string(),
    Kv3Value::UInt(value) => value.to_string(),
    Kv3Value::Double(value) => value.to_string(),
    Kv3Value::String(value) => format!("{value:?}"),
    Kv3Value::Binary(value) => format!("binary:{}", value.len()),
    Kv3Value::Array(value) => format!("array:{}", value.len()),
    Kv3Value::Object(value) => format!("object:{}", value.len()),
  }
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

fn object_set_case_insensitive(rows: &mut Vec<(String, Kv3Value)>, key: &str, value: Kv3Value) {
  if let Some((_, existing)) = rows
    .iter_mut()
    .find(|(candidate, _)| candidate.eq_ignore_ascii_case(key))
  {
    *existing = value;
  } else {
    rows.push((key.to_string(), value));
  }
}

fn parse_mod_spec(raw: &str) -> Result<ModSpec, String> {
  let Some((name, path)) = raw.split_once('=') else {
    return Err("expected NAME=PATH".to_string());
  };
  if name.trim().is_empty() || path.trim().is_empty() {
    return Err("both NAME and PATH are required".to_string());
  }
  Ok(ModSpec {
    name: name.trim().to_string(),
    path: PathBuf::from(path.trim()),
  })
}

fn build_overlay(
  game_citadel: &Path,
  mods: &[ModSpec],
  output: &Path,
  preferred_mod: Option<&str>,
) -> PocResult<()> {
  let game_citadel = game_citadel.canonicalize()?;
  let output = absolute_path(output)?;
  reject_addons_output(&game_citadel, &output)?;

  let mut bases: BTreeMap<String, LocalizationFile> = BTreeMap::new();
  let mut candidates: BTreeMap<TokenKey, Vec<Candidate>> = BTreeMap::new();
  let mut report = MergeReport::default();

  for mod_spec in mods {
    println!("\nScanning {} ({})", mod_spec.name, mod_spec.path.display());
    let archive = VpkArchive::open(&mod_spec.path)?;
    let directory_entries = VpkParser::parse_directory_from_file(&mod_spec.path)?;
    let preload_paths: BTreeSet<String> = directory_entries
      .iter()
      .filter(|entry| entry.preload_bytes > 0)
      .map(|entry| normalized_path(&entry.full_path))
      .collect();

    let localization_paths: Vec<String> = archive
      .list_entries()
      .into_iter()
      .filter(|path| is_localization_path(path))
      .collect();

    if localization_paths.is_empty() {
      println!("  no localization files");
      continue;
    }

    for file_path in localization_paths {
      let normalized_file = normalized_path(&file_path);
      if preload_paths.contains(&normalized_file) {
        return Err(format!(
                    "{} uses VPK preload bytes for {file_path}; the current extractor cannot safely read it",
                    mod_spec.name
                )
                .into());
      }

      let base = if let Some(base) = bases.get(&normalized_file) {
        base.clone()
      } else {
        let loose_path = game_citadel.join(file_path.replace('\\', "/"));
        let parsed = if loose_path.is_file() {
          parse_localization_bytes(&fs::read(&loose_path)?, &loose_path.to_string_lossy())?
        } else {
          LocalizationFile {
            language: infer_language(&file_path),
            tokens: BTreeMap::new(),
          }
        };
        bases.insert(normalized_file.clone(), parsed.clone());
        parsed
      };

      let mod_file = parse_localization_bytes(
        &archive.extract_entry(&file_path)?,
        &format!("{}:{file_path}", mod_spec.name),
      )?;
      report.localization_files += 1;
      let mut file_unchanged = 0usize;
      let mut file_changed = 0usize;

      for (token, value) in mod_file.tokens {
        let base_value = get_case_insensitive(&base.tokens, &token);
        if base_value == Some(value.as_str()) {
          report.ignored_vanilla_values += 1;
          file_unchanged += 1;
          continue;
        }

        report.proposals += 1;
        file_changed += 1;
        let key = TokenKey {
          file_path: normalized_file.clone(),
          token: token.to_ascii_lowercase(),
        };
        candidates.entry(key).or_default().push(Candidate {
          mod_name: mod_spec.name.clone(),
          file_path: file_path.replace('\\', "/"),
          token,
          value,
          is_new: base_value.is_none(),
        });
      }
      println!(
        "  {file_path} ({file_unchanged} vanilla values ignored, {file_changed} changes proposed)"
      );
    }
  }

  if candidates.is_empty() {
    println!("\nNo overlay needed: every localization token matched current vanilla.");
    println!("This is the expected result for a current Unstoppable-style vanilla guard.");
    return Ok(());
  }

  let mut winners = Vec::new();
  println!("\nResolution");
  for candidate_group in candidates.values() {
    let winner = choose_winner(candidate_group, preferred_mod);
    let distinct_values: BTreeSet<&str> = candidate_group
      .iter()
      .map(|candidate| candidate.value.as_str())
      .collect();
    if distinct_values.len() > 1 {
      report.conflicts += 1;
      println!("  CONFLICT {} :: {}", winner.file_path, winner.token);
      for candidate in candidate_group {
        let marker = if std::ptr::eq(candidate, winner) {
          "winner"
        } else {
          "blocked"
        };
        println!(
          "    [{marker}] {} = {:?}",
          candidate.mod_name, candidate.value
        );
      }
    }
    if winner.is_new {
      report.additions += 1;
    } else {
      report.replacements += 1;
    }
    winners.push(winner.clone());
  }

  let workspace = TempDir::new()?;
  let mut output_files: BTreeMap<String, LocalizationFile> = BTreeMap::new();
  for winner in winners {
    let normalized_file = normalized_path(&winner.file_path);
    let output_file = output_files
      .entry(normalized_file.clone())
      .or_insert_with(|| {
        bases
          .get(&normalized_file)
          .cloned()
          .unwrap_or_else(|| LocalizationFile {
            language: infer_language(&winner.file_path),
            tokens: BTreeMap::new(),
          })
      });
    set_case_insensitive(&mut output_file.tokens, &winner.token, winner.value);
  }

  for (normalized_file, localization) in &output_files {
    let output_file = workspace.path().join(normalized_file);
    if let Some(parent) = output_file.parent() {
      fs::create_dir_all(parent)?;
    }
    fs::write(output_file, render_localization(localization))?;
  }

  let packed_files = pack_directory(workspace.path(), &output)?;
  println!("\nOverlay written to {}", output.display());
  println!("  localization files: {}", report.localization_files);
  println!(
    "  unchanged vanilla tokens ignored: {}",
    report.ignored_vanilla_values
  );
  println!("  proposed changes: {}", report.proposals);
  println!("  conflicts: {}", report.conflicts);
  println!("  winning replacements: {}", report.replacements);
  println!("  winning additions: {}", report.additions);
  println!("  packed files: {packed_files}");
  println!(
    "\nPOC scope: conflicts are keyed by localization file + token. The VPK was not installed."
  );
  Ok(())
}

fn choose_winner<'a>(candidates: &'a [Candidate], preferred_mod: Option<&str>) -> &'a Candidate {
  preferred_mod
    .and_then(|preferred| {
      candidates
        .iter()
        .find(|candidate| candidate.mod_name.eq_ignore_ascii_case(preferred))
    })
    .unwrap_or(&candidates[0])
}

fn parse_localization_bytes(bytes: &[u8], source: &str) -> PocResult<LocalizationFile> {
  let text = std::str::from_utf8(bytes)
    .map_err(|error| format!("{source} is not UTF-8 localization text: {error}"))?;
  let text = text.strip_prefix('\u{feff}').unwrap_or(text);
  let Ok(parsed) = keyvalues_parser::parse(text) else {
    return parse_localization_lines(text, source);
  };
  if !parsed.key.eq_ignore_ascii_case("lang") {
    return Err(format!("{source} has {:?} as its root instead of lang", parsed.key).into());
  }
  let root = parsed
    .value
    .get_obj()
    .ok_or_else(|| format!("{source} has a non-object lang root"))?;
  let language = object_string(root, "Language")
    .map(str::to_string)
    .unwrap_or_else(|| infer_language(source));
  let token_object = object_value(root, "Tokens")
    .and_then(Value::get_obj)
    .ok_or_else(|| format!("{source} has no Tokens object"))?;
  let mut tokens = BTreeMap::new();
  for (token, values) in token_object.iter() {
    if let Some(value) = values.last().and_then(Value::get_str) {
      tokens.insert(token.to_string(), value.to_string());
    }
  }
  Ok(LocalizationFile { language, tokens })
}

fn parse_localization_lines(text: &str, source: &str) -> PocResult<LocalizationFile> {
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
    return Err(format!("{source} has no readable Tokens object").into());
  }
  eprintln!("  warning: recovered {source}; skipped malformed lines {skipped_lines:?}");
  Ok(LocalizationFile { language, tokens })
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

fn is_localization_path(path: &str) -> bool {
  let normalized = normalized_path(path);
  normalized.starts_with("resource/localization/") && normalized.ends_with(".txt")
}

fn normalized_path(path: &str) -> String {
  path.replace('\\', "/").to_ascii_lowercase()
}

fn infer_language(path: &str) -> String {
  let stem = Path::new(path)
    .file_stem()
    .and_then(|value| value.to_str())
    .unwrap_or("english");
  stem.rsplit('_').next().unwrap_or("english").to_string()
}

fn absolute_path(path: &Path) -> PocResult<PathBuf> {
  if path.is_absolute() {
    Ok(path.to_path_buf())
  } else {
    Ok(env::current_dir()?.join(path))
  }
}

fn reject_addons_output(game_citadel: &Path, output: &Path) -> PocResult<()> {
  let addons = game_citadel.join("addons");
  if output.starts_with(&addons) {
    return Err(
      format!(
        "refusing to write {} inside {}; this POC does not update .dmm.json",
        output.display(),
        addons.display()
      )
      .into(),
    );
  }
  Ok(())
}

fn create_demo_mods(root: &Path, game_citadel: &Path) -> PocResult<Vec<ModSpec>> {
  let base_path = game_citadel.join(DEMO_LOCALIZATION_PATH);
  let base = parse_localization_bytes(&fs::read(&base_path)?, &base_path.to_string_lossy())?;
  let guard = create_demo_mod(root, "unstoppable-vanilla-guard", &base, &[])?;
  let high = create_demo_mod(
    root,
    "high-priority-graves",
    &base,
    &[
      ("ability_necro_hauntingskull", "Soul Jar"),
      ("dmm_poc_high_only", "Added by the high-priority mod"),
    ],
  )?;
  let low = create_demo_mod(
    root,
    "lower-priority-graves",
    &base,
    &[
      ("ability_necro_hauntingskull", "Skull Collector"),
      ("ability_necro_gravestone", "Grave Empire"),
      ("dmm_poc_low_only", "Added by the lower-priority mod"),
    ],
  )?;
  Ok(vec![guard, high, low])
}

fn create_demo_mod(
  root: &Path,
  name: &str,
  base: &LocalizationFile,
  changes: &[(&str, &str)],
) -> PocResult<ModSpec> {
  let source = root.join(format!("{name}-source"));
  let localization_path = source.join(DEMO_LOCALIZATION_PATH);
  fs::create_dir_all(
    localization_path
      .parent()
      .expect("localization path has a parent"),
  )?;
  let mut localization = base.clone();
  for (token, value) in changes {
    set_case_insensitive(&mut localization.tokens, token, (*value).to_string());
  }
  fs::write(localization_path, render_localization(&localization))?;
  let path = root.join(format!("{name}_dir.vpk"));
  pack_directory(&source, &path)?;
  Ok(ModSpec {
    name: name.to_string(),
    path,
  })
}
