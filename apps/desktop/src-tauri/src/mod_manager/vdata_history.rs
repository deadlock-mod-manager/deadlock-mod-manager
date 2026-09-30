use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::sync::OnceLock;
use vpkmanager::source2::kv3::{Seg as Kv3Seg, Value as Kv3Value};

const MAGIC: &[u8; 8] = b"DMMVDH01";
const FINGERPRINT_SIZE: usize = 32;
const MIN_COMPARABLE_ROWS: usize = 32;
const MAX_CHANGED_PERCENT: usize = 10;

type Fingerprint = [u8; FINGERPRINT_SIZE];

#[derive(Debug, Clone)]
struct FingerprintChange {
  key: Fingerprint,
  value: Option<Fingerprint>,
}

#[derive(Debug, Clone)]
struct BuildDelta {
  version: u32,
  rows: Vec<FingerprintChange>,
  fields: Vec<FingerprintChange>,
}

#[derive(Debug, Clone)]
struct TableHistory {
  builds: Vec<BuildDelta>,
}

#[derive(Debug, Clone, Default)]
pub struct VdataHistoryIndex {
  tables: BTreeMap<String, TableHistory>,
}

#[derive(Debug, Clone)]
pub struct VdataBaselineMatch {
  pub build_version: u32,
  pub comparable_rows: usize,
  pub changed_rows: usize,
  rows: BTreeMap<Fingerprint, Fingerprint>,
  fields: BTreeMap<Fingerprint, Fingerprint>,
}

impl VdataHistoryIndex {
  #[must_use]
  pub fn embedded() -> &'static Self {
    static INDEX: OnceLock<VdataHistoryIndex> = OnceLock::new();
    INDEX.get_or_init(|| {
      Self::from_bytes(include_bytes!("../../assets/vdata-history.bin"))
        .expect("embedded VData history index must be valid")
    })
  }

  pub fn from_bytes(bytes: &[u8]) -> Result<Self, String> {
    let mut reader = Reader::new(bytes);
    if reader.take(MAGIC.len())? != MAGIC {
      return Err("VData history index has an invalid magic header".to_string());
    }
    let table_count = reader.u32()? as usize;
    let mut tables = BTreeMap::new();
    for _ in 0..table_count {
      let path = reader.string()?;
      let build_count = reader.u32()? as usize;
      let mut builds = Vec::with_capacity(build_count);
      for _ in 0..build_count {
        builds.push(BuildDelta {
          version: reader.u32()?,
          rows: reader.changes()?,
          fields: reader.changes()?,
        });
      }
      tables.insert(normalize_path(&path), TableHistory { builds });
    }
    if !reader.is_empty() {
      return Err("VData history index has trailing bytes".to_string());
    }
    Ok(Self { tables })
  }

  #[must_use]
  pub fn match_baseline(
    &self,
    file_path: &str,
    candidate_root: &Kv3Value,
  ) -> Option<VdataBaselineMatch> {
    let table = self.tables.get(&normalize_path(file_path))?;
    let candidate_rows = row_fingerprints(candidate_root)?;
    let mut rows = BTreeMap::new();
    let mut best: Option<(usize, usize, usize, u32)> = None;

    for (build_index, build) in table.builds.iter().enumerate() {
      apply_changes(&mut rows, &build.rows);
      let comparable = candidate_rows
        .keys()
        .filter(|key| rows.contains_key(*key))
        .count();
      let changed = candidate_rows
        .iter()
        .filter(|(key, value)| rows.get(*key).is_some_and(|known| known != *value))
        .count();
      let replace = best.is_none_or(|(_, best_comparable, best_changed, best_version)| {
        changed * best_comparable < best_changed * comparable
          || (changed * best_comparable == best_changed * comparable
            && (comparable > best_comparable
              || (comparable == best_comparable && build.version > best_version)))
      });
      if replace {
        best = Some((build_index, comparable, changed, build.version));
      }
    }

    let (best_index, comparable_rows, changed_rows, build_version) = best?;
    if comparable_rows < MIN_COMPARABLE_ROWS
      || changed_rows * 100 > comparable_rows * MAX_CHANGED_PERCENT
    {
      return None;
    }

    let mut rows = BTreeMap::new();
    let mut fields = BTreeMap::new();
    for build in table.builds.iter().take(best_index + 1) {
      apply_changes(&mut rows, &build.rows);
      apply_changes(&mut fields, &build.fields);
    }
    Some(VdataBaselineMatch {
      build_version,
      comparable_rows,
      changed_rows,
      rows,
      fields,
    })
  }
}

impl VdataBaselineMatch {
  #[must_use]
  pub fn contains_row(&self, row_name: &str) -> bool {
    self.rows.contains_key(&row_key(row_name))
  }

  #[must_use]
  pub fn row_matches(&self, row_name: &str, value: &Kv3Value) -> bool {
    self
      .rows
      .get(&row_key(row_name))
      .is_some_and(|known| *known == value_fingerprint(value))
  }

  #[must_use]
  pub fn field_matches(&self, row_name: &str, path: &[Kv3Seg], value: &Kv3Value) -> bool {
    self
      .fields
      .get(&field_key(row_name, path))
      .is_some_and(|known| *known == value_fingerprint(value))
  }
}

/// Encodes historical full-table snapshots into a delta-compressed fingerprint index.
/// This is public so the repository's maintenance utility can refresh the embedded asset.
pub fn encode_history_index(tables: &[(String, Vec<(u32, Kv3Value)>)]) -> Result<Vec<u8>, String> {
  let mut output = Vec::new();
  output.extend_from_slice(MAGIC);
  push_u32(&mut output, tables.len())?;
  for (path, snapshots) in tables {
    push_string(&mut output, path)?;
    push_u32(&mut output, snapshots.len())?;
    let mut previous_rows = BTreeMap::new();
    let mut previous_fields = BTreeMap::new();
    for (version, root) in snapshots {
      let rows = row_fingerprints(root)
        .ok_or_else(|| format!("Historical {path} build {version} root is not an object"))?;
      let fields = field_fingerprints(root)
        .ok_or_else(|| format!("Historical {path} build {version} root is not an object"))?;
      push_u32_value(&mut output, *version);
      push_changes(&mut output, &map_changes(&previous_rows, &rows))?;
      push_changes(&mut output, &map_changes(&previous_fields, &fields))?;
      previous_rows = rows;
      previous_fields = fields;
    }
  }
  Ok(output)
}

fn row_fingerprints(root: &Kv3Value) -> Option<BTreeMap<Fingerprint, Fingerprint>> {
  let Kv3Value::Object(rows) = root else {
    return None;
  };
  Some(
    rows
      .iter()
      .map(|(name, value)| (row_key(name), value_fingerprint(value)))
      .collect(),
  )
}

fn field_fingerprints(root: &Kv3Value) -> Option<BTreeMap<Fingerprint, Fingerprint>> {
  let Kv3Value::Object(rows) = root else {
    return None;
  };
  let mut fields = BTreeMap::new();
  for (row_name, row) in rows {
    collect_field_fingerprints(row_name, row, &mut Vec::new(), &mut fields);
  }
  Some(fields)
}

fn collect_field_fingerprints(
  row_name: &str,
  value: &Kv3Value,
  path: &mut Vec<Kv3Seg>,
  output: &mut BTreeMap<Fingerprint, Fingerprint>,
) {
  if let Kv3Value::Object(fields) = value {
    for (key, child) in fields {
      if key.eq_ignore_ascii_case("_editor") {
        continue;
      }
      path.push(Kv3Seg::Key(key.clone()));
      collect_field_fingerprints(row_name, child, path, output);
      path.pop();
    }
  } else {
    output.insert(field_key(row_name, path), value_fingerprint(value));
  }
}

fn row_key(row_name: &str) -> Fingerprint {
  hash_parts(&[b"row", row_name.to_ascii_lowercase().as_bytes()])
}

fn field_key(row_name: &str, path: &[Kv3Seg]) -> Fingerprint {
  let mut hasher = Sha256::new();
  hash_part(&mut hasher, b"field");
  hash_part(&mut hasher, row_name.to_ascii_lowercase().as_bytes());
  for segment in path {
    match segment {
      Kv3Seg::Key(key) => {
        hash_part(&mut hasher, b"key");
        hash_part(&mut hasher, key.to_ascii_lowercase().as_bytes());
      }
      Kv3Seg::Index(index) => {
        hash_part(&mut hasher, b"index");
        hash_part(&mut hasher, &index.to_le_bytes());
      }
    }
  }
  hasher.finalize().into()
}

fn value_fingerprint(value: &Kv3Value) -> Fingerprint {
  let mut hasher = Sha256::new();
  hash_value(&mut hasher, value);
  hasher.finalize().into()
}

fn hash_value(hasher: &mut Sha256, value: &Kv3Value) {
  match value {
    Kv3Value::Null => hash_part(hasher, b"null"),
    Kv3Value::Bool(value) => hash_parts_into(hasher, &[b"bool", &[*value as u8]]),
    Kv3Value::Int(value) => hash_parts_into(hasher, &[b"int", &value.to_le_bytes()]),
    Kv3Value::UInt(value) => hash_parts_into(hasher, &[b"uint", &value.to_le_bytes()]),
    Kv3Value::Double(value) => {
      // Different KV3 decompilers can print the same engine value with tiny
      // decimal noise. Three significant digits keeps large nested values stable;
      // integer and string-backed gameplay properties remain exact.
      let value = canonical_double(*value);
      hash_parts_into(hasher, &[b"double", &value.to_bits().to_le_bytes()]);
    }
    Kv3Value::String(value) => hash_parts_into(hasher, &[b"string", value.as_bytes()]),
    Kv3Value::Binary(value) => hash_parts_into(hasher, &[b"binary", value]),
    Kv3Value::Array(values) => {
      hash_part(hasher, b"array");
      hash_part(hasher, &values.len().to_le_bytes());
      for value in values {
        hash_value(hasher, value);
      }
    }
    Kv3Value::Object(fields) => {
      hash_part(hasher, b"object");
      let mut fields = fields
        .iter()
        .filter(|(key, _)| !key.eq_ignore_ascii_case("_editor"))
        .collect::<Vec<_>>();
      fields.sort_by_cached_key(|(key, _)| key.to_ascii_lowercase());
      hash_part(hasher, &fields.len().to_le_bytes());
      for (key, value) in fields {
        hash_part(hasher, key.to_ascii_lowercase().as_bytes());
        hash_value(hasher, value);
      }
    }
  }
}

fn canonical_double(value: f64) -> f64 {
  if !value.is_finite() || value == 0.0 {
    return value;
  }
  let exponent = value.abs().log10().floor() as i32;
  let scale = 10f64.powi(2 - exponent);
  (value * scale).round() / scale
}

fn hash_parts(parts: &[&[u8]]) -> Fingerprint {
  let mut hasher = Sha256::new();
  hash_parts_into(&mut hasher, parts);
  hasher.finalize().into()
}

fn hash_parts_into(hasher: &mut Sha256, parts: &[&[u8]]) {
  for part in parts {
    hash_part(hasher, part);
  }
}

fn hash_part(hasher: &mut Sha256, part: &[u8]) {
  hasher.update(part.len().to_le_bytes());
  hasher.update(part);
}

fn map_changes(
  previous: &BTreeMap<Fingerprint, Fingerprint>,
  current: &BTreeMap<Fingerprint, Fingerprint>,
) -> Vec<FingerprintChange> {
  let keys = previous
    .keys()
    .chain(current.keys())
    .copied()
    .collect::<BTreeSet<_>>();
  keys
    .into_iter()
    .filter_map(|key| {
      let previous = previous.get(&key);
      let current = current.get(&key);
      (previous != current).then(|| FingerprintChange {
        key,
        value: current.copied(),
      })
    })
    .collect()
}

fn apply_changes(values: &mut BTreeMap<Fingerprint, Fingerprint>, changes: &[FingerprintChange]) {
  for change in changes {
    if let Some(value) = change.value {
      values.insert(change.key, value);
    } else {
      values.remove(&change.key);
    }
  }
}

fn push_changes(output: &mut Vec<u8>, changes: &[FingerprintChange]) -> Result<(), String> {
  push_u32(output, changes.len())?;
  for change in changes {
    output.extend_from_slice(&change.key);
    output.push(u8::from(change.value.is_some()));
    if let Some(value) = change.value {
      output.extend_from_slice(&value);
    }
  }
  Ok(())
}

fn push_string(output: &mut Vec<u8>, value: &str) -> Result<(), String> {
  push_u32(output, value.len())?;
  output.extend_from_slice(value.as_bytes());
  Ok(())
}

fn push_u32(output: &mut Vec<u8>, value: usize) -> Result<(), String> {
  let value = u32::try_from(value).map_err(|_| "VData history index is too large".to_string())?;
  push_u32_value(output, value);
  Ok(())
}

fn push_u32_value(output: &mut Vec<u8>, value: u32) {
  output.extend_from_slice(&value.to_le_bytes());
}

fn normalize_path(path: &str) -> String {
  path.replace('\\', "/").to_ascii_lowercase()
}

struct Reader<'a> {
  remaining: &'a [u8],
}

impl<'a> Reader<'a> {
  fn new(bytes: &'a [u8]) -> Self {
    Self { remaining: bytes }
  }

  fn take(&mut self, count: usize) -> Result<&'a [u8], String> {
    if self.remaining.len() < count {
      return Err("VData history index is truncated".to_string());
    }
    let (value, remaining) = self.remaining.split_at(count);
    self.remaining = remaining;
    Ok(value)
  }

  fn u32(&mut self) -> Result<u32, String> {
    let bytes: [u8; 4] = self.take(4)?.try_into().expect("four bytes requested");
    Ok(u32::from_le_bytes(bytes))
  }

  fn fingerprint(&mut self) -> Result<Fingerprint, String> {
    Ok(
      self
        .take(FINGERPRINT_SIZE)?
        .try_into()
        .expect("fingerprint-sized slice requested"),
    )
  }

  fn string(&mut self) -> Result<String, String> {
    let length = self.u32()? as usize;
    String::from_utf8(self.take(length)?.to_vec())
      .map_err(|_| "VData history index contains invalid UTF-8".to_string())
  }

  fn changes(&mut self) -> Result<Vec<FingerprintChange>, String> {
    let count = self.u32()? as usize;
    let mut changes = Vec::with_capacity(count);
    for _ in 0..count {
      let key = self.fingerprint()?;
      let value = match self.take(1)?[0] {
        0 => None,
        1 => Some(self.fingerprint()?),
        _ => return Err("VData history index contains an invalid change tag".to_string()),
      };
      changes.push(FingerprintChange { key, value });
    }
    Ok(changes)
  }

  fn is_empty(&self) -> bool {
    self.remaining.is_empty()
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn root(cooldown: i64, stamina: i64) -> Kv3Value {
    Kv3Value::Object(vec![
      (
        "ability_celeste".to_string(),
        Kv3Value::Object(vec![("cooldown".to_string(), Kv3Value::Int(cooldown))]),
      ),
      (
        "upgrade_improved_stamina".to_string(),
        Kv3Value::Object(vec![("value".to_string(), Kv3Value::Int(stamina))]),
      ),
    ])
  }

  #[test]
  fn round_trips_and_matches_the_closest_baseline() {
    let path = "scripts/abilities.vdata_c";
    // Repeat rows so this small fixture meets the same confidence threshold as production.
    let mut candidate_rows = match root(32, 100) {
      Kv3Value::Object(rows) => rows,
      _ => unreachable!(),
    };
    for index in 0..40 {
      candidate_rows.push((format!("unchanged_{index}"), Kv3Value::Int(index)));
    }
    let mut snapshots = Vec::new();
    for (version, cooldown) in [(100, 30), (101, 32), (102, 34)] {
      let mut rows = match root(cooldown, 1) {
        Kv3Value::Object(rows) => rows,
        _ => unreachable!(),
      };
      for index in 0..40 {
        rows.push((format!("unchanged_{index}"), Kv3Value::Int(index)));
      }
      snapshots.push((version, Kv3Value::Object(rows)));
    }
    let bytes = encode_history_index(&[(path.to_string(), snapshots)]).unwrap();
    let index = VdataHistoryIndex::from_bytes(&bytes).unwrap();
    let baseline = index
      .match_baseline(path, &Kv3Value::Object(candidate_rows))
      .unwrap();
    assert_eq!(baseline.build_version, 101);
    assert_eq!(baseline.changed_rows, 1);
    assert!(baseline.field_matches(
      "ability_celeste",
      &[Kv3Seg::Key("cooldown".to_string())],
      &Kv3Value::Int(32)
    ));
    assert!(!baseline.field_matches(
      "upgrade_improved_stamina",
      &[Kv3Seg::Key("value".to_string())],
      &Kv3Value::Int(100)
    ));
  }
}
