use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::sync::OnceLock;
use vpkmanager::source2::kv3::{Seg as Kv3Seg, Value as Kv3Value};

const MAGIC: &[u8; 8] = b"DMMVDH03";
const EXACT_MAGIC: &[u8; 8] = b"DMMVDH02";
const LEGACY_MAGIC: &[u8; 8] = b"DMMVDH01";
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
  exact_rows: Vec<FingerprintChange>,
  fields: Vec<FingerprintChange>,
}

#[derive(Debug, Clone)]
struct TableHistory {
  exact: bool,
  builds: Vec<BuildDelta>,
}

struct CandidateIntent {
  rows: Vec<(Fingerprint, Fingerprint, bool)>,
  fields: Vec<(Fingerprint, Fingerprint, bool)>,
}

impl CandidateIntent {
  fn new(root: &Kv3Value) -> Self {
    fn fields(
      name: &str,
      value: &Kv3Value,
      path: &mut Vec<Kv3Seg>,
      output: &mut Vec<(Fingerprint, Fingerprint, bool)>,
    ) {
      if let Kv3Value::Object(values) = value {
        for (key, value) in values {
          if key.eq_ignore_ascii_case("_editor") {
            continue;
          }
          path.push(Kv3Seg::Key(key.clone()));
          fields(name, value, path, output);
          path.pop();
        }
      } else {
        output.push((
          field_key(name, path),
          value_fingerprint(value, FingerprintMode::Exact),
          contains_double(value),
        ));
      }
    }
    let mut intent = Self {
      rows: Vec::new(),
      fields: Vec::new(),
    };
    if let Kv3Value::Object(rows) = root {
      for (name, value) in rows {
        intent.rows.push((
          row_key(name),
          value_fingerprint(value, FingerprintMode::Exact),
          contains_double(value),
        ));
        fields(name, value, &mut Vec::new(), &mut intent.fields);
      }
    }
    intent
  }
}

#[derive(Debug, Clone, Default)]
pub struct VdataHistoryIndex {
  tables: BTreeMap<String, TableHistory>,
  fallback: BTreeMap<String, TableHistory>,
  observed_strings: BTreeMap<Fingerprint, BTreeSet<Fingerprint>>,
}

#[derive(Debug, Clone)]
pub struct VdataBaselineMatch {
  pub build_version: u32,
  pub comparable_rows: usize,
  pub changed_rows: usize,
  rows: BTreeMap<Fingerprint, Fingerprint>,
  fields: BTreeMap<Fingerprint, Fingerprint>,
  exact: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BaselineStatus {
  Matched,
  LegacyApproximate,
  Ambiguous,
  Unavailable,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BaselineEvidence {
  pub status: BaselineStatus,
  pub build_versions: Vec<u32>,
  pub comparable_rows: usize,
  pub changed_rows: usize,
}

#[derive(Clone, Copy)]
enum FingerprintMode {
  Discovery,
  Exact,
}

impl VdataHistoryIndex {
  /// String bindings remain exact even in the older numeric history format.
  pub fn observed_string_field(
    &self,
    file_path: &str,
    row_name: &str,
    field_name: &str,
    value: &str,
  ) -> bool {
    let key = field_key(row_name, &[Kv3Seg::Key(field_name.into())]);
    let value = value_fingerprint(&Kv3Value::String(value.into()), FingerprintMode::Exact);
    self
      .observed_strings
      .get(&string_binding_key(file_path, key))
      .is_some_and(|values| values.contains(&value))
  }

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
    let magic = reader.take(MAGIC.len())?;
    if magic != MAGIC && magic != EXACT_MAGIC && magic != LEGACY_MAGIC {
      return Err("VData history index has an invalid magic header".to_string());
    }
    let exact = magic != LEGACY_MAGIC;
    let table_count = reader.u32()? as usize;
    let mut tables = BTreeMap::new();
    let mut observed_strings = BTreeMap::<Fingerprint, BTreeSet<Fingerprint>>::new();
    for _ in 0..table_count {
      let path = reader.string()?;
      let build_count = reader.u32()? as usize;
      if build_count > reader.remaining.len() / 12 {
        return Err("VData history build count exceeds its payload".into());
      }
      let mut builds = Vec::with_capacity(build_count);
      for _ in 0..build_count {
        let version = reader.u32()?;
        let rows = reader.changes()?;
        let exact_rows = if exact { reader.changes()? } else { Vec::new() };
        let fields = reader.changes()?;
        if magic != MAGIC {
          // Older files only retain fingerprints, so carry all known field values forward.
          for field in &fields {
            if let Some(value) = field.value {
              observed_strings
                .entry(string_binding_key(&path, field.key))
                .or_default()
                .insert(value);
            }
          }
        }
        builds.push(BuildDelta {
          version,
          rows,
          exact_rows,
          fields,
        });
      }
      tables.insert(normalize_path(&path), TableHistory { exact, builds });
    }
    if magic == MAGIC {
      let count = reader.u32()? as usize;
      if count > reader.remaining.len() / 36 {
        return Err("String binding count exceeds its payload".into());
      }
      for _ in 0..count {
        let key = reader.fingerprint()?;
        let count = reader.u32()? as usize;
        if count > reader.remaining.len() / FINGERPRINT_SIZE {
          return Err("String binding value count exceeds its payload".into());
        }
        let values = (0..count)
          .map(|_| reader.fingerprint())
          .collect::<Result<_, _>>()?;
        observed_strings.insert(key, values);
      }
    }
    if !reader.is_empty() {
      return Err("VData history index has trailing bytes".to_string());
    }
    Ok(Self {
      tables,
      fallback: BTreeMap::new(),
      observed_strings,
    })
  }

  #[must_use]
  #[cfg(test)]
  pub fn match_baseline(
    &self,
    file_path: &str,
    candidate_root: &Kv3Value,
  ) -> Option<VdataBaselineMatch> {
    self.match_with_evidence(file_path, candidate_root).0
  }

  pub fn match_with_evidence(
    &self,
    file_path: &str,
    candidate_root: &Kv3Value,
  ) -> (Option<VdataBaselineMatch>, BaselineEvidence) {
    let mut primary = self.match_table(self.tables.get(&normalize_path(file_path)), candidate_root);
    let fallback = self.match_table(
      self.fallback.get(&normalize_path(file_path)),
      candidate_root,
    );
    if primary.1.status == BaselineStatus::Unavailable {
      return fallback;
    }
    if fallback.1.status == BaselineStatus::Unavailable {
      return primary;
    }
    let quality = (primary.1.changed_rows * fallback.1.comparable_rows)
      .cmp(&(fallback.1.changed_rows * primary.1.comparable_rows))
      .then_with(|| fallback.1.comparable_rows.cmp(&primary.1.comparable_rows));
    match quality {
      std::cmp::Ordering::Less => return primary,
      std::cmp::Ordering::Greater => return fallback,
      std::cmp::Ordering::Equal => {}
    }
    let same_intent = if let (Some(current), Some(old)) = (&primary.0, &fallback.0) {
      let intent = CandidateIntent::new(candidate_root);
      current.intent(&intent) == old.intent(&intent)
    } else {
      false
    };
    primary.1.build_versions.extend(fallback.1.build_versions);
    primary.1.build_versions.sort_unstable();
    primary.1.build_versions.dedup();
    if !same_intent {
      primary.0 = None;
      primary.1.status = BaselineStatus::Ambiguous;
    }
    primary
  }

  fn match_table(
    &self,
    table: Option<&TableHistory>,
    candidate_root: &Kv3Value,
  ) -> (Option<VdataBaselineMatch>, BaselineEvidence) {
    let unavailable = || {
      (
        None,
        BaselineEvidence {
          status: BaselineStatus::Unavailable,
          build_versions: Vec::new(),
          comparable_rows: 0,
          changed_rows: 0,
        },
      )
    };
    let Some(table) = table else {
      return unavailable();
    };
    let Some(candidate_rows) = row_fingerprints(candidate_root, FingerprintMode::Discovery) else {
      return unavailable();
    };
    let mut rows = BTreeMap::new();
    let mut best: Option<(usize, usize)> = None;
    let mut best_indices = Vec::new();

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
      if comparable < MIN_COMPARABLE_ROWS || changed * 100 > comparable * MAX_CHANGED_PERCENT {
        continue;
      }
      let replace = best.is_none_or(|(best_comparable, best_changed)| {
        changed * best_comparable < best_changed * comparable
          || (changed * best_comparable == best_changed * comparable
            && comparable > best_comparable)
      });
      if replace {
        best = Some((comparable, changed));
        best_indices.clear();
      }
      if best == Some((comparable, changed)) {
        best_indices.push(build_index);
      }
    }

    let Some((comparable_rows, changed_rows)) = best else {
      return unavailable();
    };
    let mut evidence = BaselineEvidence {
      status: if table.exact {
        BaselineStatus::Matched
      } else {
        BaselineStatus::LegacyApproximate
      },
      build_versions: best_indices
        .iter()
        .map(|index| table.builds[*index].version)
        .collect(),
      comparable_rows,
      changed_rows,
    };

    let mut rows = BTreeMap::new();
    let mut fields = BTreeMap::new();
    let mut selected = None;
    let mut selected_intent = None;
    let candidate_intent = (best_indices.len() > 1).then(|| CandidateIntent::new(candidate_root));
    let last_index = *best_indices.last().expect("a best build exists");
    for (index, build) in table.builds.iter().enumerate() {
      apply_changes(
        &mut rows,
        if table.exact {
          &build.exact_rows
        } else {
          &build.rows
        },
      );
      apply_changes(&mut fields, &build.fields);
      if !best_indices.contains(&index) {
        continue;
      }
      let baseline = VdataBaselineMatch {
        build_version: build.version,
        comparable_rows,
        changed_rows,
        rows: rows.clone(),
        fields: fields.clone(),
        exact: table.exact,
      };
      if let Some(candidate) = &candidate_intent {
        let intent = baseline.intent(candidate);
        if selected_intent
          .as_ref()
          .is_some_and(|known| known != &intent)
        {
          evidence.status = BaselineStatus::Ambiguous;
          return (None, evidence);
        }
        selected_intent = Some(intent);
      }
      selected = Some(baseline);
      if index == last_index {
        break;
      }
    }
    (selected, evidence)
  }

  pub fn with_observed(&self, observed: &Self) -> Self {
    let mut history = observed.clone();
    history.fallback = self.tables.clone();
    for (key, values) in &self.observed_strings {
      history
        .observed_strings
        .entry(*key)
        .or_default()
        .extend(values);
    }
    history
  }

  pub fn record(&mut self, file_path: &str, version: u32, root: &Kv3Value) -> Result<bool, String> {
    let discovery = row_fingerprints(root, FingerprintMode::Discovery)
      .ok_or("Observed VData root is not an object")?;
    let exact = row_fingerprints(root, FingerprintMode::Exact).expect("root was validated");
    let fields = field_fingerprints(root, FingerprintMode::Exact).expect("root was validated");
    let mut bindings_changed = false;
    for (key, value) in string_bindings(file_path, root) {
      bindings_changed |= self.observed_strings.entry(key).or_default().insert(value);
    }
    let table = self
      .tables
      .entry(normalize_path(file_path))
      .or_insert_with(|| TableHistory {
        exact: true,
        builds: Vec::new(),
      });
    if !table.exact {
      return Err("Observed history must use exact fingerprints".into());
    }
    let mut previous_rows = BTreeMap::new();
    let mut previous_exact = BTreeMap::new();
    let mut previous_fields = BTreeMap::new();
    for build in &table.builds {
      apply_changes(&mut previous_rows, &build.rows);
      apply_changes(&mut previous_exact, &build.exact_rows);
      apply_changes(&mut previous_fields, &build.fields);
    }
    if previous_exact == exact && previous_fields == fields {
      return Ok(bindings_changed);
    }
    table.builds.push(BuildDelta {
      version,
      rows: map_changes(&previous_rows, &discovery),
      exact_rows: map_changes(&previous_exact, &exact),
      fields: map_changes(&previous_fields, &fields),
    });
    // Compact the retained prefix into one complete snapshot, keeping the latest 64 changes.
    if table.builds.len() > 64 {
      let oldest = table.builds.remove(0);
      let next = &mut table.builds[0];
      fn combine(old: &[FingerprintChange], next: &mut Vec<FingerprintChange>) {
        let mut values = BTreeMap::new();
        apply_changes(&mut values, old);
        apply_changes(&mut values, next);
        *next = map_changes(&BTreeMap::new(), &values);
      }
      combine(&oldest.rows, &mut next.rows);
      combine(&oldest.exact_rows, &mut next.exact_rows);
      combine(&oldest.fields, &mut next.fields);
    }
    Ok(true)
  }

  pub fn to_bytes(&self) -> Result<Vec<u8>, String> {
    let mut output = MAGIC.to_vec();
    push_u32(&mut output, self.tables.len())?;
    for (path, table) in &self.tables {
      if !table.exact {
        return Err("Approximate history cannot be written as exact history".into());
      }
      push_string(&mut output, path)?;
      push_u32(&mut output, table.builds.len())?;
      for build in &table.builds {
        push_u32_value(&mut output, build.version);
        push_changes(&mut output, &build.rows)?;
        push_changes(&mut output, &build.exact_rows)?;
        push_changes(&mut output, &build.fields)?;
      }
    }
    write_string_bindings(&mut output, &self.observed_strings)?;
    Ok(output)
  }
}

impl VdataBaselineMatch {
  #[must_use]
  pub fn contains_row(&self, row_name: &str) -> bool {
    self.rows.contains_key(&row_key(row_name))
  }

  #[must_use]
  pub fn row_matches(&self, row_name: &str, value: &Kv3Value) -> bool {
    if !self.exact && contains_double(value) {
      return false;
    }
    self
      .rows
      .get(&row_key(row_name))
      .is_some_and(|known| *known == value_fingerprint(value, FingerprintMode::Exact))
  }

  #[must_use]
  pub fn field_matches(&self, row_name: &str, path: &[Kv3Seg], value: &Kv3Value) -> bool {
    if !self.exact && contains_double(value) {
      return false;
    }
    self
      .fields
      .get(&field_key(row_name, path))
      .is_some_and(|known| *known == value_fingerprint(value, FingerprintMode::Exact))
  }

  fn intent(&self, candidate: &CandidateIntent) -> Vec<Option<bool>> {
    candidate
      .rows
      .iter()
      .map(|(key, value, double)| {
        self
          .rows
          .get(key)
          .map(|known| (self.exact || !double) && known == value)
      })
      .chain(candidate.fields.iter().map(|(key, value, double)| {
        self
          .fields
          .get(key)
          .map(|known| (self.exact || !double) && known == value)
      }))
      .collect()
  }
}

fn contains_double(value: &Kv3Value) -> bool {
  match value {
    Kv3Value::Double(_) => true,
    Kv3Value::Array(values) => values.iter().any(contains_double),
    Kv3Value::Object(fields) => fields
      .iter()
      .filter(|(key, _)| !key.eq_ignore_ascii_case("_editor"))
      .any(|(_, value)| contains_double(value)),
    _ => false,
  }
}

/// Encodes historical full-table snapshots into a delta-compressed fingerprint index.
/// This is public so the repository's maintenance utility can refresh the embedded asset.
pub fn encode_history_index(tables: &[(String, Vec<(u32, Kv3Value)>)]) -> Result<Vec<u8>, String> {
  let mut output = Vec::new();
  output.extend_from_slice(MAGIC);
  push_u32(&mut output, tables.len())?;
  let mut strings = BTreeMap::<Fingerprint, BTreeSet<Fingerprint>>::new();
  for (path, snapshots) in tables {
    push_string(&mut output, path)?;
    push_u32(&mut output, snapshots.len())?;
    let mut previous_rows = BTreeMap::new();
    let mut previous_exact_rows = BTreeMap::new();
    let mut previous_fields = BTreeMap::new();
    for (version, root) in snapshots {
      for (key, value) in string_bindings(path, root) {
        strings.entry(key).or_default().insert(value);
      }
      let rows = row_fingerprints(root, FingerprintMode::Discovery)
        .ok_or_else(|| format!("Historical {path} build {version} root is not an object"))?;
      let exact_rows = row_fingerprints(root, FingerprintMode::Exact).expect("root was validated");
      let fields = field_fingerprints(root, FingerprintMode::Exact)
        .ok_or_else(|| format!("Historical {path} build {version} root is not an object"))?;
      push_u32_value(&mut output, *version);
      push_changes(&mut output, &map_changes(&previous_rows, &rows))?;
      push_changes(&mut output, &map_changes(&previous_exact_rows, &exact_rows))?;
      push_changes(&mut output, &map_changes(&previous_fields, &fields))?;
      previous_rows = rows;
      previous_exact_rows = exact_rows;
      previous_fields = fields;
    }
  }
  write_string_bindings(&mut output, &strings)?;
  Ok(output)
}

fn string_binding_key(file_path: &str, field: Fingerprint) -> Fingerprint {
  hash_parts(&[normalize_path(file_path).as_bytes(), &field])
}

fn string_bindings(file_path: &str, root: &Kv3Value) -> BTreeMap<Fingerprint, Fingerprint> {
  fn visit(
    file: &str,
    row: &str,
    value: &Kv3Value,
    path: &mut Vec<Kv3Seg>,
    output: &mut BTreeMap<Fingerprint, Fingerprint>,
  ) {
    match value {
      Kv3Value::Object(fields) => {
        for (key, value) in fields {
          if key.eq_ignore_ascii_case("_editor") {
            continue;
          }
          path.push(Kv3Seg::Key(key.clone()));
          visit(file, row, value, path, output);
          path.pop();
        }
      }
      Kv3Value::String(_) => {
        output.insert(
          string_binding_key(file, field_key(row, path)),
          value_fingerprint(value, FingerprintMode::Exact),
        );
      }
      _ => {}
    }
  }
  let mut output = BTreeMap::new();
  if let Kv3Value::Object(rows) = root {
    for (row, value) in rows {
      visit(file_path, row, value, &mut Vec::new(), &mut output);
    }
  }
  output
}

fn write_string_bindings(
  output: &mut Vec<u8>,
  bindings: &BTreeMap<Fingerprint, BTreeSet<Fingerprint>>,
) -> Result<(), String> {
  push_u32(output, bindings.len())?;
  for (key, values) in bindings {
    output.extend_from_slice(key);
    push_u32(output, values.len())?;
    for value in values {
      output.extend_from_slice(value);
    }
  }
  Ok(())
}

fn row_fingerprints(
  root: &Kv3Value,
  mode: FingerprintMode,
) -> Option<BTreeMap<Fingerprint, Fingerprint>> {
  let Kv3Value::Object(rows) = root else {
    return None;
  };
  Some(
    rows
      .iter()
      .map(|(name, value)| (row_key(name), value_fingerprint(value, mode)))
      .collect(),
  )
}

fn field_fingerprints(
  root: &Kv3Value,
  mode: FingerprintMode,
) -> Option<BTreeMap<Fingerprint, Fingerprint>> {
  let Kv3Value::Object(rows) = root else {
    return None;
  };
  let mut fields = BTreeMap::new();
  for (row_name, row) in rows {
    collect_field_fingerprints(row_name, row, &mut Vec::new(), &mut fields, mode);
  }
  Some(fields)
}

fn collect_field_fingerprints(
  row_name: &str,
  value: &Kv3Value,
  path: &mut Vec<Kv3Seg>,
  output: &mut BTreeMap<Fingerprint, Fingerprint>,
  mode: FingerprintMode,
) {
  if let Kv3Value::Object(fields) = value {
    for (key, child) in fields {
      if key.eq_ignore_ascii_case("_editor") {
        continue;
      }
      path.push(Kv3Seg::Key(key.clone()));
      collect_field_fingerprints(row_name, child, path, output, mode);
      path.pop();
    }
  } else {
    output.insert(field_key(row_name, path), value_fingerprint(value, mode));
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

fn value_fingerprint(value: &Kv3Value, mode: FingerprintMode) -> Fingerprint {
  let mut hasher = Sha256::new();
  hash_value(&mut hasher, value, mode);
  hasher.finalize().into()
}

fn hash_value(hasher: &mut Sha256, value: &Kv3Value, mode: FingerprintMode) {
  match value {
    Kv3Value::Null => hash_part(hasher, b"null"),
    Kv3Value::Bool(value) => hash_parts_into(hasher, &[b"bool", &[*value as u8]]),
    Kv3Value::Int(value) => hash_parts_into(hasher, &[b"int", &value.to_le_bytes()]),
    Kv3Value::UInt(value) => hash_parts_into(hasher, &[b"uint", &value.to_le_bytes()]),
    Kv3Value::Double(value) => {
      // Compiler noise can identify a likely build, but cannot prove an edit was absent.
      let value = match mode {
        FingerprintMode::Discovery => canonical_double(*value),
        FingerprintMode::Exact => *value,
      };
      hash_parts_into(hasher, &[b"double", &value.to_bits().to_le_bytes()]);
    }
    Kv3Value::String(value) => hash_parts_into(hasher, &[b"string", value.as_bytes()]),
    Kv3Value::Binary(value) => hash_parts_into(hasher, &[b"binary", value]),
    Kv3Value::Array(values) => {
      hash_part(hasher, b"array");
      hash_part(hasher, &values.len().to_le_bytes());
      for value in values {
        hash_value(hasher, value, mode);
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
        hash_value(hasher, value, mode);
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
    if count > self.remaining.len() / (FINGERPRINT_SIZE + 1) {
      return Err("VData history change count exceeds its payload".into());
    }
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
  fn string_bindings_survive_compaction_roundtrip_and_remain_scoped_to_table_and_row() {
    let path = "scripts/heroes.vdata_c";
    let row = "hero_copper";
    let mut history = VdataHistoryIndex::default();
    for version in 1..=70 {
      let root = Kv3Value::Object(vec![(
        row.into(),
        Kv3Value::Object(vec![(
          "m_strModelName".into(),
          Kv3Value::String(format!("models/version_{version}.vmdl")),
        )]),
      )]);
      assert!(history.record(path, version, &root).unwrap());
    }
    let restored = VdataHistoryIndex::from_bytes(&history.to_bytes().unwrap()).unwrap();
    assert!(restored.observed_string_field(path, row, "m_strModelName", "models/version_1.vmdl"));
    assert!(restored.observed_string_field(path, row, "m_strModelName", "models/version_70.vmdl"));
    assert!(!restored.observed_string_field(
      "scripts/other.vdata_c",
      row,
      "m_strModelName",
      "models/version_1.vmdl"
    ));
    assert!(!restored.observed_string_field(
      path,
      "hero_other",
      "m_strModelName",
      "models/version_1.vmdl"
    ));
    assert!(!restored.observed_string_field(path, row, "m_strModelName", "models/version_71.vmdl"));
  }

  #[test]
  fn exact_v2_bindings_upgrade_to_durable_history() {
    let root = Kv3Value::Object(vec![(
      "hero_copper".into(),
      Kv3Value::Object(vec![(
        "m_strModelName".into(),
        Kv3Value::String("models/original.vmdl".into()),
      )]),
    )]);
    let mut bytes =
      encode_history_index(&[("scripts/heroes.vdata_c".into(), vec![(1, root)])]).unwrap();
    // One v3 ledger entry: count, key, value count, value.
    bytes.truncate(bytes.len() - 72);
    bytes[..8].copy_from_slice(EXACT_MAGIC);
    let history = VdataHistoryIndex::from_bytes(&bytes).unwrap();
    let restored = VdataHistoryIndex::from_bytes(&history.to_bytes().unwrap()).unwrap();
    assert!(restored.observed_string_field(
      "scripts/heroes.vdata_c",
      "hero_copper",
      "m_strModelName",
      "models/original.vmdl"
    ));
    assert_eq!(&history.to_bytes().unwrap()[..8], MAGIC);
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

  fn with_padding(value: f64) -> Kv3Value {
    let mut rows = vec![(
      "authored".into(),
      Kv3Value::Object(vec![("scale".into(), Kv3Value::Double(value))]),
    )];
    rows.extend((0..40).map(|index| (format!("padding_{index}"), Kv3Value::Int(index))));
    Kv3Value::Object(rows)
  }

  #[test]
  fn discovery_tolerance_never_discards_small_authored_double_edits() {
    let path = "scripts/example.vdata_c";
    let bytes = encode_history_index(&[(path.into(), vec![(1, with_padding(1.001))])]).unwrap();
    let history = VdataHistoryIndex::from_bytes(&bytes).unwrap();
    let (baseline, evidence) = history.match_with_evidence(path, &with_padding(1.004));
    assert_eq!(evidence.status, BaselineStatus::Matched);
    let baseline = baseline.unwrap();
    assert!(!baseline.row_matches("authored", with_padding(1.004).get("authored").unwrap()));
    assert!(!baseline.field_matches(
      "authored",
      &[Kv3Seg::Key("scale".into())],
      &Kv3Value::Double(1.004)
    ));
    assert!(baseline.field_matches(
      "authored",
      &[Kv3Seg::Key("scale".into())],
      &Kv3Value::Double(1.001)
    ));
  }

  #[test]
  fn tied_builds_are_accepted_only_when_they_agree_on_authored_changes() {
    let path = "scripts/example.vdata_c";
    let bytes = encode_history_index(&[(
      path.into(),
      vec![(1, with_padding(1.001)), (2, with_padding(1.004))],
    )])
    .unwrap();
    let history = VdataHistoryIndex::from_bytes(&bytes).unwrap();
    let (baseline, evidence) = history.match_with_evidence(path, &with_padding(1.004));
    assert!(baseline.is_none());
    assert_eq!(evidence.status, BaselineStatus::Ambiguous);
    assert_eq!(evidence.build_versions, vec![1, 2]);
    let (baseline, evidence) = history.match_with_evidence(path, &with_padding(1.003));
    assert!(baseline.is_some());
    assert_eq!(evidence.status, BaselineStatus::Matched);
    assert_eq!(evidence.build_versions, vec![1, 2]);
  }

  #[test]
  fn legacy_history_can_discover_builds_but_cannot_prove_double_values_unchanged() {
    let path = "scripts/example.vdata_c";
    let root = with_padding(1.001);
    let mut bytes = LEGACY_MAGIC.to_vec();
    push_u32(&mut bytes, 1).unwrap();
    push_string(&mut bytes, path).unwrap();
    push_u32(&mut bytes, 1).unwrap();
    push_u32_value(&mut bytes, 1);
    push_changes(
      &mut bytes,
      &map_changes(
        &BTreeMap::new(),
        &row_fingerprints(&root, FingerprintMode::Discovery).unwrap(),
      ),
    )
    .unwrap();
    push_changes(
      &mut bytes,
      &map_changes(
        &BTreeMap::new(),
        &field_fingerprints(&root, FingerprintMode::Discovery).unwrap(),
      ),
    )
    .unwrap();
    let history = VdataHistoryIndex::from_bytes(&bytes).unwrap();
    let (baseline, evidence) = history.match_with_evidence(path, &root);
    assert_eq!(evidence.status, BaselineStatus::LegacyApproximate);
    let baseline = baseline.unwrap();
    assert!(!baseline.row_matches("authored", root.get("authored").unwrap()));
    assert!(!baseline.field_matches(
      "authored",
      &[Kv3Seg::Key("scale".into())],
      &Kv3Value::Double(1.001)
    ));
    assert!(baseline.row_matches("padding_1", &Kv3Value::Int(1)));
    assert!(VdataHistoryIndex::embedded().tables.len() >= 2);
  }

  #[test]
  fn malformed_history_is_rejected_without_large_allocations() {
    let mut bytes = MAGIC.to_vec();
    bytes.extend(u32::MAX.to_le_bytes());
    assert!(VdataHistoryIndex::from_bytes(&bytes).is_err());
    for length in 0..8 {
      assert!(VdataHistoryIndex::from_bytes(&MAGIC[..length]).is_err());
    }
  }

  #[test]
  fn observed_history_round_trips_and_compacts_retained_deltas() {
    let path = "scripts/example.vdata_c";
    let mut history = VdataHistoryIndex::default();
    for version in 0..70 {
      assert!(
        history
          .record(path, version, &with_padding(f64::from(version)))
          .unwrap()
      );
    }
    assert!(!history.record(path, 70, &with_padding(69.0)).unwrap());
    let bytes = history.to_bytes().unwrap();
    let restored = VdataHistoryIndex::from_bytes(&bytes).unwrap();
    assert_eq!(restored.tables[path].builds.len(), 64);
    for version in 6..70 {
      let baseline = restored
        .match_baseline(path, &with_padding(f64::from(version)))
        .unwrap();
      assert_eq!(baseline.build_version, version);
      assert!(baseline.field_matches(
        "authored",
        &[Kv3Seg::Key("scale".into())],
        &Kv3Value::Double(f64::from(version))
      ));
    }
    assert!(VdataHistoryIndex::embedded().to_bytes().is_err());
  }

  #[test]
  fn observed_and_embedded_candidates_cannot_disagree_silently() {
    let path = "scripts/example.vdata_c";
    let mut older = VdataHistoryIndex::default();
    older.record(path, 1, &with_padding(1.001)).unwrap();
    let mut newer = VdataHistoryIndex::default();
    newer.record(path, 2, &with_padding(1.004)).unwrap();
    let combined = older.with_observed(&newer);
    let (baseline, evidence) = combined.match_with_evidence(path, &with_padding(1.004));
    assert!(baseline.is_none());
    assert_eq!(evidence.status, BaselineStatus::Ambiguous);
    assert_eq!(evidence.build_versions, vec![1, 2]);
    let combined = older.with_observed(&VdataHistoryIndex::default());
    assert_eq!(
      combined
        .match_baseline(path, &with_padding(1.001))
        .unwrap()
        .build_version,
      1
    );
    older.record(path, 2, &with_padding(1.004)).unwrap();
    let mut current = VdataHistoryIndex::default();
    current.record(path, 3, &with_padding(50.0)).unwrap();
    let (baseline, evidence) = older
      .with_observed(&current)
      .match_with_evidence(path, &with_padding(1.004));
    assert!(baseline.is_none());
    assert_eq!(evidence.status, BaselineStatus::Ambiguous);
    assert_eq!(evidence.build_versions, vec![1, 2]);
  }
}
