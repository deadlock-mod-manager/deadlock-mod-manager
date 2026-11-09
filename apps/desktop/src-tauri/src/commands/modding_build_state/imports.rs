use super::*;

pub(super) fn canonical(bytes: &[u8]) -> Result<Vec<u8>, Error> {
  if bytes.starts_with(b"<!-- dmx encoding binary") {
    return source2_model::dmx::canonical_binary_export(bytes).map_err(invalid);
  }
  if !bytes.starts_with(b"<!-- dmx encoding keyvalues2") && !bytes.starts_with(b"<!-- kv3") {
    return Ok(bytes.to_vec());
  }
  let text = std::str::from_utf8(bytes).map_err(invalid)?;
  let quoted = regex::Regex::new(r#""([^"\r\n]+)""#).unwrap();
  let mut normalized = text.to_owned();
  for capture in quoted
    .captures_iter(text)
    .collect::<Vec<_>>()
    .into_iter()
    .rev()
  {
    let value = capture.get(1).unwrap();
    let path = value.as_str().replace("\\\\", "/").replace('\\', "/");
    if path.contains('/') && relative(&path, false).is_ok() {
      normalized.replace_range(value.range(), &path);
    }
  }
  let text = normalized.as_str();
  let pattern =
    regex::Regex::new(r#"(?:"id"\s+"elementid"|"element")\s+"([0-9a-fA-F-]{36})""#).unwrap();
  let mut ids = BTreeMap::new();
  let mut edits = Vec::new();
  for captures in pattern.captures_iter(text) {
    let id = captures.get(1).unwrap();
    let index = ids.len();
    let number = *ids.entry(id.as_str()).or_insert(index);
    edits.push((id.range(), format!("element-{number}")));
  }
  let mut result = text.to_owned();
  for (range, value) in edits.into_iter().rev() {
    result.replace_range(range, &value);
  }
  Ok(result.into_bytes())
}

pub(super) fn matching_sources(export: &Path, root: &Path) -> Result<BTreeSet<String>, Error> {
  let mut matches = BTreeSet::new();
  for path in super::super::modding_batch::files(export)? {
    let local = contained(root, &path)?;
    if !local.is_file() {
      continue;
    }
    let original = canonical(&read(&contained(export, &path)?)?)?;
    if canonical(&read(&local)?)? == original {
      matches.insert(path);
    }
  }
  Ok(matches)
}

pub(in crate::commands) fn record_import(
  addon: &ModdingAddon,
  content: &Path,
  game: &Path,
) -> Result<(), Error> {
  let root = Path::new(&addon.content_path);
  let mut state = State::load(root)?;
  let inputs = super::super::modding_batch::files(content)?
    .into_iter()
    .filter(|path| game.join(output_path(path)).is_file())
    .map(|path| root.join(path))
    .collect::<Vec<_>>();
  let snapshot = Snapshot::capture(addon, &inputs)?;
  let matches = matching_sources(content, root)?;
  let mut imported = Vec::new();
  for path in inputs {
    let name = relative_name(root, &path)?;
    let output = output_path(&name);
    if !state.inputs.contains_key(&name)
      && snapshot
        .sources(&name)
        .keys()
        .all(|source| matches.contains(source))
      && read(&contained(Path::new(&addon.game_path), &output)?)?
        == read(&contained(game, &output)?)?
    {
      imported.push(path);
    }
  }
  snapshot.record(&mut state, root, Path::new(&addon.game_path), &imported)?;
  state.save(root)
}

/// Adopt legacy exports only after comparing their sources to a fresh export.
/// Compiled replacements are reversible and never touch the installed game.
pub(in crate::commands) fn adopt_existing(
  addon: &ModdingAddon,
  sdk: &Path,
  cli: &Path,
  snapshot: &Snapshot,
  state: &mut State,
  inputs: &[PathBuf],
) -> Result<(), Error> {
  let root = Path::new(&addon.content_path);
  let game = Path::new(&addon.game_path);
  let mut candidates = Vec::new();
  for input in inputs {
    let name = relative_name(root, input)?;
    if !state.inputs.contains_key(&name) && contained(game, &output_path(&name))?.is_file() {
      candidates.push(name);
    }
  }
  if candidates.is_empty() {
    return Ok(());
  }
  let archive = source2_model::vpk_extract::VpkArchive::open(Path::new(&addon.archive_path))
    .map_err(invalid)?;
  candidates.retain(|name| archive.contains_entry(&output_path(name)));
  if candidates.is_empty() {
    return Ok(());
  }
  let export = tempfile::tempdir()?;
  for batch in candidates.chunks(32) {
    let entries = batch
      .iter()
      .filter(|name| !export.path().join(name).is_file())
      .map(|name| output_path(name))
      .collect::<Vec<_>>();
    if entries.is_empty() {
      continue;
    }
    super::super::modding_import::decompile(
      cli,
      sdk,
      Path::new(&addon.archive_path),
      &entries,
      export.path(),
    )?;
  }
  for name in candidates.iter().filter(|name| name.ends_with(".vmdl")) {
    let path = export.path().join(name);
    if path.is_file() {
      let text = source2_tools::modeldoc_preview_entity(&std::fs::read_to_string(&path)?)
        .map_err(invalid)?;
      std::fs::write(path, text)?;
    }
  }
  super::super::modding_housekeeping::normalize_particles(export.path())?;
  let matches = matching_sources(export.path(), root)?;
  let mut adopted = Vec::new();
  let mut edits = Vec::new();
  let listing = archive.list_entries();
  for name in candidates {
    if !snapshot
      .sources(&name)
      .keys()
      .all(|source| matches.contains(source))
    {
      continue;
    }
    if ![".vmdl", ".vnmskel", ".vnmclip"]
      .iter()
      .any(|extension| name.ends_with(extension))
    {
      adopted.push(root.join(name));
      continue;
    }
    let prefix = format!("{name}+");
    let outputs = std::iter::once(output_path(&name)).chain(
      listing
        .iter()
        .filter(|path| path.starts_with(&prefix) && path.ends_with("_c"))
        .cloned(),
    );
    for output in outputs {
      let target = contained(game, &output)?;
      if !target.is_file() {
        continue;
      }
      let original = archive
        .extract_entry_limited(&output, 256 * 1024 * 1024)
        .map_err(invalid)?;
      if read(&target)? != original {
        edits.push(modding_edits::Edit {
          from: output.clone(),
          to: output,
          bytes: original,
        });
      }
    }
    adopted.push(root.join(name));
  }
  let backup = if edits.is_empty() {
    None
  } else {
    Some(modding_edits::commit(game, edits)?)
  };
  snapshot.record(state, root, game, &adopted)?;
  if let Err(error) = state.save(root) {
    if let Some(backup) = backup {
      modding_edits::undo(game, &backup)?;
    }
    return Err(error);
  }
  log::info!(
    "[Workbench] Preserved {} unchanged imported resources in {}; compiled backups: {:?}",
    adopted.len(),
    addon.name,
    backup
  );
  Ok(())
}
