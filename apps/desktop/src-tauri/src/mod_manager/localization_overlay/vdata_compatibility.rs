use super::*;

mod semantics;
use semantics::{Reference, known_class_and_enums, references};
mod inheritance;
mod reference_fallback;
pub(super) use inheritance::{InheritedRebase, rebase_inherited};

pub(super) const ABILITIES_PATH: &str = "scripts/abilities.vdata_c";
const DEVELOPMENT_STATE: &str = "m_eHeroDevelopmentState";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RepairKind {
  HeroDevelopmentState,
  InheritedDefinition,
  RetainedDependency,
  CurrentReference,
  EnumMapEntry,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataRepair {
  pub mod_id: String,
  pub source_vpk: String,
  pub file_path: String,
  pub row_name: String,
  pub kind: RepairKind,
  pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WarningKind {
  MissingDefinition,
  UnverifiedDefinition,
  UnverifiedInheritance,
  MissingDevelopmentState,
  OmittedHeroDefinition,
  OmittedEnumMapEntry,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WarningReason {
  DefinitionUnavailable,
  CompetingDefinitions,
  UnrecognizedClassOrEnum,
  AmbiguousTemplates,
  InheritanceCycle,
  VisibilityMigrationUnverified,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataWarning {
  pub mod_id: String,
  pub source_vpk: String,
  pub file_path: String,
  pub row_name: String,
  pub kind: WarningKind,
  pub field_path: String,
  pub target_file: String,
  pub target_row: String,
  pub reason: WarningReason,
  pub detail: String,
}

struct DependencyFailure {
  kind: WarningKind,
  reason: WarningReason,
  file: String,
  row: String,
}

impl DependencyFailure {
  fn new(reference: &Reference, kind: WarningKind, reason: WarningReason) -> Self {
    Self {
      kind,
      reason,
      file: reference.table.clone(),
      row: reference.row.clone(),
    }
  }
}

fn row<'a>(root: &'a Kv3Value, name: &str) -> Option<&'a Kv3Value> {
  object_get_case_insensitive(root.as_object()?, name)
}

fn owner<'a>(
  merged: &'a MergedCompiledData,
  name: &str,
  path: &[Kv3Seg],
) -> Option<&'a CompiledDataCandidate> {
  merged
    .origins
    .get(&name.to_ascii_lowercase())?
    .iter()
    .filter(|(patch, _)| path.starts_with(patch) || patch.starts_with(path))
    .max_by_key(|(patch, _)| patch.len())
    .map(|(_, owner)| owner)
}

type DefinitionKey = (usize, String);
type RetainedDefinitions<'a> = BTreeMap<DefinitionKey, &'a CompiledDataCandidateValue>;

fn collect_needed<'a>(
  reference: &Reference,
  tables: &'a [CompiledDataTable],
  merged: &[MergedCompiledData],
) -> Result<RetainedDefinitions<'a>, DependencyFailure> {
  let mut pending = vec![reference.clone()];
  let mut needed = RetainedDefinitions::new();
  let mut inheritance_edges: BTreeMap<DefinitionKey, Vec<DefinitionKey>> = BTreeMap::new();
  while let Some(reference) = pending.pop() {
    let Some(index) = tables
      .iter()
      .position(|table| table.file_path == reference.table)
    else {
      return Err(DependencyFailure::new(
        &reference,
        WarningKind::MissingDefinition,
        WarningReason::DefinitionUnavailable,
      ));
    };
    if row(&merged[index].root, &reference.row).is_some() {
      continue;
    }
    let key = (index, reference.row.to_ascii_lowercase());
    if needed.contains_key(&key) {
      continue;
    }
    let Some(candidates) = tables[index].retired_rows.get(&key.1) else {
      return Err(DependencyFailure::new(
        &reference,
        WarningKind::MissingDefinition,
        WarningReason::DefinitionUnavailable,
      ));
    };
    let candidate = &candidates[0];
    if candidates.iter().any(|other| {
      !runtime_values_equal(&candidate.value, &other.value) || candidate.encoding != other.encoding
    }) {
      return Err(DependencyFailure::new(
        &reference,
        WarningKind::UnverifiedDefinition,
        WarningReason::CompetingDefinitions,
      ));
    }
    if !known_class_and_enums(&candidate.value, &tables[index].base_root) {
      return Err(DependencyFailure::new(
        &reference,
        WarningKind::UnverifiedDefinition,
        WarningReason::UnrecognizedClassOrEnum,
      ));
    }
    needed.insert(key.clone(), candidate);
    for child in references(&candidate.value, &tables[index].file_path) {
      if child.inheritance {
        if merged[index]
          .origins
          .contains_key(&child.row.to_ascii_lowercase())
        {
          return Err(DependencyFailure::new(
            &child,
            WarningKind::UnverifiedDefinition,
            WarningReason::CompetingDefinitions,
          ));
        }
        inheritance_edges
          .entry(key.clone())
          .or_default()
          .push((index, child.row.to_ascii_lowercase()));
      }
      pending.push(child);
    }
  }
  // Ability triggers can legitimately refer back to each other; inheritance cannot.
  let mut remaining: BTreeSet<_> = needed.keys().cloned().collect();
  loop {
    let leaves: Vec<_> = remaining
      .iter()
      .filter(|key| {
        inheritance_edges
          .get(*key)
          .is_none_or(|targets| targets.iter().all(|target| !remaining.contains(target)))
      })
      .cloned()
      .collect();
    if leaves.is_empty() {
      break;
    }
    for leaf in leaves {
      remaining.remove(&leaf);
    }
  }
  if !remaining.is_empty() {
    return Err(DependencyFailure::new(
      reference,
      WarningKind::UnverifiedDefinition,
      WarningReason::InheritanceCycle,
    ));
  }
  Ok(needed)
}

pub(super) struct PreparedData {
  pub merged: Vec<MergedCompiledData>,
  pub repairs: Vec<DataRepair>,
  pub warnings: Vec<DataWarning>,
}

pub(super) fn prepare(
  tables: &[CompiledDataTable],
  resolutions: &[LocalizationResolution],
) -> Result<PreparedData, Error> {
  let mut merged = tables
    .iter()
    .map(|table| table.merge(resolutions))
    .collect::<Result<Vec<_>, _>>()?;
  let mut repairs = Vec::new();
  let mut warnings = Vec::new();
  let mut missing = Vec::new();
  let mut skipped_rebases = BTreeSet::new();
  let mut omitted_heroes = BTreeSet::new();
  for (index, table) in tables.iter().enumerate() {
    for group in table.groups.values() {
      let resolution = resolutions
        .iter()
        .find(|resolution| resolution.conflict_key == group.key);
      let Some(winner) = choose_compiled_winner(group, resolution)? else {
        continue;
      };
      let Some((original, encoding)) = &winner.unrebased else {
        continue;
      };
      let modified_parent = references(original, &table.file_path)
        .into_iter()
        .find(|reference| {
          reference.inheritance
            && merged[index]
              .origins
              .contains_key(&reference.row.to_ascii_lowercase())
        });
      if let Some(parent) = modified_parent {
        let Kv3Value::Object(rows) = &mut merged[index].root else {
          unreachable!("merged root is an object")
        };
        object_set_case_insensitive(rows, &group.row_name, original.clone());
        encoding_set_case_insensitive(
          merged[index]
            .encoding
            .as_object_mut()
            .expect("merged encoding is an object"),
          &group.row_name,
          encoding.clone(),
        );
        skipped_rebases.insert((index, group.row_name.to_ascii_lowercase()));
        warnings.push(DataWarning {
          mod_id: winner.candidate.mod_id.clone(),
          source_vpk: winner.candidate.source_vpk.clone(),
          file_path: table.file_path.clone(),
          row_name: group.row_name.clone(),
          kind: WarningKind::UnverifiedInheritance,
          field_path: compiled_path_label(&parent.path),
          target_file: parent.table,
          target_row: parent.row,
          reason: WarningReason::CompetingDefinitions,
          detail: String::new(),
        });
      }
    }
  }
  for (index, table) in tables.iter().enumerate() {
    for repair in &table.row_repairs {
      if matches!(repair.kind, RepairKind::InheritedDefinition)
        && skipped_rebases.contains(&(index, repair.row_name.to_ascii_lowercase()))
      {
        continue;
      }
      let path = if matches!(repair.kind, RepairKind::HeroDevelopmentState) {
        vec![Kv3Seg::Key(DEVELOPMENT_STATE.into())]
      } else {
        Vec::new()
      };
      if owner(&merged[index], &repair.row_name, &path)
        .is_some_and(|owner| owner.mod_id == repair.mod_id && owner.source_vpk == repair.source_vpk)
        && (!matches!(repair.kind, RepairKind::HeroDevelopmentState)
          || row(&merged[index].root, &repair.row_name)
            .and_then(|row| row.get(DEVELOPMENT_STATE))
            .and_then(Kv3Value::as_str)
            == Some(repair.detail.as_str()))
      {
        repairs.push(repair.clone());
      }
    }
    for warning in &table.row_warnings {
      if owner(&merged[index], &warning.row_name, &[]).is_some_and(|owner| {
        owner.mod_id == warning.mod_id && owner.source_vpk == warning.source_vpk
      }) {
        warnings.push(warning.clone());
      }
    }
    for (name, value) in merged[index]
      .root
      .as_object()
      .expect("merged root is an object")
    {
      if table.file_path != HEROES_VDATA_PATH
        && row(&table.base_root, name).is_none()
        && !skipped_rebases.contains(&(index, name.to_ascii_lowercase()))
        && references(value, &table.file_path)
          .iter()
          .any(|reference| reference.inheritance)
        && value.get("_class").and_then(Kv3Value::as_str).is_some()
        && !semantics::known_native_class(value, &table.base_root)
        && let Some(owner) = owner(&merged[index], name, &[])
      {
        warnings.push(DataWarning {
          mod_id: owner.mod_id.clone(),
          source_vpk: owner.source_vpk.clone(),
          file_path: table.file_path.clone(),
          row_name: name.clone(),
          kind: WarningKind::UnverifiedInheritance,
          field_path: String::new(),
          target_file: String::new(),
          target_row: String::new(),
          reason: WarningReason::UnrecognizedClassOrEnum,
          detail: format!(
            "_class={}",
            value
              .get("_class")
              .and_then(Kv3Value::as_str)
              .unwrap_or_default()
          ),
        });
      }
      if table.file_path == HEROES_VDATA_PATH
        && value.get("_class").and_then(Kv3Value::as_str) == Some("CitadelHeroData_t")
        && value.get("m_bDisabled").and_then(Kv3Value::as_bool) == Some(false)
        && value.get("m_bInDevelopment").and_then(Kv3Value::as_bool) == Some(false)
        && value.get(DEVELOPMENT_STATE).is_none()
        && row(&table.base_root, name).is_none()
        && table.base_root.as_object().is_some_and(|rows| {
          rows
            .iter()
            .any(|(_, row)| row.get(DEVELOPMENT_STATE).is_some())
        })
        && let Some(owner) = owner(&merged[index], name, &[])
      {
        warnings.push(DataWarning {
          mod_id: owner.mod_id.clone(),
          source_vpk: owner.source_vpk.clone(),
          file_path: table.file_path.clone(),
          row_name: name.clone(),
          kind: WarningKind::MissingDevelopmentState,
          field_path: DEVELOPMENT_STATE.into(),
          target_file: String::new(),
          target_row: String::new(),
          reason: WarningReason::VisibilityMigrationUnverified,
          detail: String::new(),
        });
      }
      for reference in references(value, &table.file_path) {
        if tables.iter().enumerate().any(|(i, target)| {
          target.file_path == reference.table && row(&merged[i].root, &reference.row).is_some()
        }) {
          continue;
        }
        // Existing unresolved vanilla references can be native engine fallbacks.
        // Report only references introduced by mods or lost during preparation.
        let vanilla_reference = row(&table.base_root, name).is_some_and(|value| {
          references(value, &table.file_path)
            .iter()
            .any(|old| old.path == reference.path && old.row.eq_ignore_ascii_case(&reference.row))
        });
        let vanilla_target = tables.iter().any(|target| {
          target.file_path == reference.table && row(&target.base_root, &reference.row).is_some()
        });
        if vanilla_reference && !vanilla_target {
          continue;
        }
        if let Some(owner) = owner(&merged[index], name, &reference.path) {
          missing.push((index, name.clone(), reference, owner.clone()));
        }
      }
    }
  }
  for (index, name, reference, owner) in missing {
    match collect_needed(&reference, tables, &merged) {
      Ok(needed) => {
        for ((target, target_name), candidate) in needed {
          let Kv3Value::Object(rows) = &mut merged[target].root else {
            unreachable!("merged root is an object")
          };
          object_set_case_insensitive(rows, &target_name, candidate.value.clone());
          encoding_set_case_insensitive(
            merged[target]
              .encoding
              .as_object_mut()
              .expect("merged encoding is an object"),
            &target_name,
            candidate.encoding.clone(),
          );
          merged[target].applied_rows.insert(target_name.clone());
          repairs.push(DataRepair {
            mod_id: candidate.candidate.mod_id.clone(),
            source_vpk: candidate.candidate.source_vpk.clone(),
            file_path: tables[target].file_path.clone(),
            row_name: target_name,
            kind: RepairKind::RetainedDependency,
            detail: format!(
              "{}:{} · {}",
              tables[index].file_path,
              name,
              compiled_path_label(&reference.path)
            ),
          });
        }
      }
      Err(failure) => {
        let unavailable = matches!(failure.reason, WarningReason::DefinitionUnavailable);
        if unavailable
          && reference_fallback::restore(&tables[index], &mut merged[index], &name, &reference)?
        {
          repairs.push(DataRepair {
            mod_id: owner.mod_id,
            source_vpk: owner.source_vpk,
            file_path: tables[index].file_path.clone(),
            row_name: name,
            kind: RepairKind::CurrentReference,
            detail: format!(
              "{} · {}:{} unavailable; current game binding restored",
              compiled_path_label(&reference.path),
              reference.table,
              reference.row
            ),
          });
          continue;
        }
        let kind = if unavailable
          && reference_fallback::unavailable_new_hero(
            &tables[index],
            &merged[index],
            &name,
            &reference,
          ) {
          omitted_heroes.insert((index, name.clone()));
          WarningKind::OmittedHeroDefinition
        } else {
          failure.kind
        };
        warnings.push(DataWarning {
          mod_id: owner.mod_id,
          source_vpk: owner.source_vpk,
          file_path: tables[index].file_path.clone(),
          row_name: name,
          kind,
          field_path: compiled_path_label(&reference.path),
          target_file: reference.table,
          target_row: reference.row,
          reason: failure.reason,
          detail: format!("{}:{}", failure.file, failure.row),
        });
      }
    }
  }
  for (index, name) in omitted_heroes {
    reference_fallback::omit(&mut merged[index], &name);
  }
  // A failed chain may subsequently be satisfied by another successful repair.
  warnings.retain(|warning| {
    matches!(
      warning.kind,
      WarningKind::MissingDevelopmentState | WarningKind::UnverifiedInheritance
    ) || !tables.iter().enumerate().any(|(index, table)| {
      table.file_path == warning.target_file
        && row(&merged[index].root, &warning.target_row).is_some()
    })
  });
  Ok(PreparedData {
    merged,
    repairs,
    warnings,
  })
}

#[cfg(test)]
mod tests;
