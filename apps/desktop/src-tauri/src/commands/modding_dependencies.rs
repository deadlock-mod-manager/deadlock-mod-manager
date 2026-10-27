use std::collections::{HashSet, VecDeque};
use std::io::Write;
use std::path::{Component, Path};

use source2_model::resource::Resource;
use source2_model::vpk_extract::VpkArchive;

use crate::errors::Error;

fn invalid_reference() -> Error {
  Error::InvalidInput("Invalid compiled resource dependency table".into())
}

pub(super) fn references(data: &[u8]) -> Result<Vec<String>, Error> {
  let offset = u32::from_le_bytes(
    data
      .get(..4)
      .ok_or_else(invalid_reference)?
      .try_into()
      .map_err(|_| invalid_reference())?,
  ) as usize;
  let count = u32::from_le_bytes(
    data
      .get(4..8)
      .ok_or_else(invalid_reference)?
      .try_into()
      .map_err(|_| invalid_reference())?,
  ) as usize;
  if offset > data.len() || count > (data.len() - offset) / 16 {
    return Err(invalid_reference());
  }
  (0..count)
    .map(|index| {
      let position = offset + index * 16 + 8;
      let relative = i64::from_le_bytes(
        data[position..position + 8]
          .try_into()
          .map_err(|_| invalid_reference())?,
      );
      let start = position
        .checked_add_signed(isize::try_from(relative).map_err(|_| invalid_reference())?)
        .ok_or_else(invalid_reference)?;
      let remaining = data.get(start..).ok_or_else(invalid_reference)?;
      let end = remaining
        .iter()
        .position(|byte| *byte == 0)
        .ok_or_else(invalid_reference)?;
      let name = std::str::from_utf8(&remaining[..end])
        .map_err(|_| invalid_reference())?
        .replace('\\', "/");
      if name.is_empty()
        || name.contains(':')
        || !Path::new(&name)
          .components()
          .all(|part| matches!(part, Component::Normal(_)))
      {
        return Err(invalid_reference());
      }
      Ok(if name.ends_with("_c") {
        name
      } else {
        format!("{name}_c")
      })
    })
    .collect()
}

pub(super) fn stage_dependencies(
  archive: &VpkArchive,
  model: &str,
  output: &Path,
) -> Result<Vec<String>, Error> {
  let mut pending = VecDeque::from([model.to_owned()]);
  let mut seen = HashSet::new();
  let mut skeletons = Vec::new();
  let mut copied = 0;
  let mut missing = 0;
  let mut bytes = 0_u64;
  while let Some(path) = pending.pop_front() {
    if !seen.insert(path.clone()) {
      continue;
    }
    if seen.len() > 8192 {
      return Err(Error::InvalidInput(
        "This model exceeds the workspace dependency limit".into(),
      ));
    }
    if !archive.contains_entry(&path) {
      missing += 1;
      continue;
    }
    let data = archive
      .extract_entry_limited(&path, 256 * 1024 * 1024)
      .map_err(|e| Error::InvalidInput(e.to_string()))?;
    bytes += data.len() as u64;
    if bytes > 2 * 1024 * 1024 * 1024 {
      return Err(Error::InvalidInput(
        "This model needs more than 2 GB of compiled dependencies".into(),
      ));
    }
    if path.ends_with(".vnmskel_c") {
      skeletons.push(path.clone());
    }
    let resource = Resource::parse(data).map_err(|e| Error::InvalidInput(e.to_string()))?;
    if let Some(table) = resource.block_bytes("RERL") {
      pending.extend(references(table)?);
    }
    let target = output.join(&path);
    std::fs::create_dir_all(target.parent().ok_or_else(invalid_reference)?)?;
    let mut file = tempfile::NamedTempFile::new_in(target.parent().ok_or_else(invalid_reference)?)?;
    file.write_all(&resource.data)?;
    match file.persist_noclobber(&target) {
      Ok(_) => copied += 1,
      Err(error) if error.error.kind() == std::io::ErrorKind::AlreadyExists => {}
      Err(error) => return Err(error.error.into()),
    }
  }
  log::info!(
    "[ModdingTools] Staged dependencies: model={model}, copied={copied}, unavailable={missing}"
  );
  Ok(skeletons)
}

#[cfg(test)]
mod tests {
  use super::*;

  fn fixture() -> Vec<u8> {
    let mut data = vec![0; 24];
    data[..4].copy_from_slice(&8_u32.to_le_bytes());
    data[4..8].copy_from_slice(&1_u32.to_le_bytes());
    data[16..24].copy_from_slice(&8_i64.to_le_bytes());
    data.extend_from_slice(b"models/hero.vnmskel\0");
    data
  }

  #[test]
  fn resolves_relative_names_and_rejects_invalid_dependency_tables() {
    assert_eq!(references(&fixture()).unwrap(), ["models/hero.vnmskel_c"]);
    let mut invalid = fixture();
    invalid[16..24].copy_from_slice(&i64::MAX.to_le_bytes());
    assert!(references(&invalid).is_err());
    let mut invalid = fixture();
    invalid.pop();
    assert!(references(&invalid).is_err());
    let mut invalid = fixture();
    invalid[4..8].copy_from_slice(&u32::MAX.to_le_bytes());
    assert!(references(&invalid).is_err());
    let mut invalid = fixture();
    invalid.truncate(24);
    invalid.extend_from_slice(b"../outside.vnmskel\0");
    assert!(references(&invalid).is_err());
  }
}
