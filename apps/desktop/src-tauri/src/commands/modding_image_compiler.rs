use super::{modding_edits, modding_source, modding_workspace::contained};
use crate::errors::Error;
use std::{
  collections::BTreeSet,
  io::Read,
  path::{Path, PathBuf},
  sync::Mutex,
};

const HEADER: &str = "<!-- kv3 encoding:text:version{e21c7f3c-8a33-41c5-9977-a76d3a32aa0d} format:generic:version{7412167c-06e9-4698-aff2-e63eb59037e7} -->";
static SYNC_LOCK: Mutex<()> = Mutex::new(());

fn reconcile_images(text: &str, images: &[String]) -> Result<Option<String>, Error> {
  let tree = modding_source::tree(text)?;
  if tree
    .get("generic_data_type")
    .and_then(|value| value.as_string())
    != Some("panorama_image_list")
  {
    return Err(Error::InvalidInput(
      "image_compiler.vdata must use generic_data_type = \"panorama_image_list\"".into(),
    ));
  }
  let entries = tree
    .get("image_list")
    .and_then(|value| value.as_array())
    .ok_or_else(|| {
      Error::InvalidInput("image_compiler.vdata must contain an image_list array".into())
    })?;
  let existing: BTreeSet<_> = entries
    .iter()
    .filter_map(|value| value.as_string())
    .map(|value| value.replace('\\', "/").to_ascii_lowercase())
    .collect();
  let expected: BTreeSet<_> = images
    .iter()
    .map(|image| image.to_ascii_lowercase())
    .collect();
  if existing == expected && entries.len() == images.len() {
    return Ok(None);
  }
  let contents = modding_source::array_contents(text, "image_list")?;
  let newline = if text.contains("\r\n") { "\r\n" } else { "\n" };
  let mut insertion = newline.to_owned();
  for image in images {
    let quoted =
      serde_json::to_string(image).map_err(|error| Error::InvalidInput(error.to_string()))?;
    insertion.push_str(&format!("        panorama:{quoted},{newline}"));
  }
  insertion.push_str("    ");
  let mut updated = text.to_owned();
  updated.replace_range(contents, &insertion);
  modding_source::tree(&updated)?;
  Ok(Some(updated))
}

pub(super) fn sync(root: &Path) -> Result<Vec<PathBuf>, Error> {
  let _guard = SYNC_LOCK
    .lock()
    .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?;
  if !root.is_dir() {
    return Ok(Vec::new());
  }
  let mut seen = BTreeSet::new();
  let mut directories = vec![root.to_path_buf()];
  for name in ["panorama", "images"] {
    let mut matches = Vec::new();
    for directory in directories {
      for entry in std::fs::read_dir(directory)? {
        let entry = entry?;
        if entry.file_type()?.is_dir() && entry.file_name().eq_ignore_ascii_case(name) {
          matches.push(entry.path());
        }
      }
    }
    directories = matches;
  }
  let mut inputs = Vec::new();
  for directory in directories {
    inputs.extend(super::modding_images::image_inputs(&directory)?);
  }
  let images: Vec<_> = inputs
    .into_iter()
    .filter_map(|input| {
      let image = format!("file://{{images}}/{}", input.path);
      seen.insert(image.to_ascii_lowercase()).then_some(image)
    })
    .collect();
  let mut targets = Vec::new();
  for relative in ["image_compiler.vdata", "panorama/image_compiler.vdata"] {
    let path = contained(root, relative)?;
    if path.is_file() {
      targets.push(path);
    }
  }
  if targets.is_empty() {
    targets.push(contained(root, "panorama/image_compiler.vdata")?);
  }
  let mut edits = Vec::new();
  for path in targets {
    let original = if path.exists() {
      let mut bytes = Vec::new();
      std::fs::File::open(&path)?
        .take(4 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)?;
      if bytes.len() > 4 * 1024 * 1024 {
        return Err(Error::InvalidInput(
          "image_compiler.vdata exceeds the 4 MB source limit".into(),
        ));
      }
      Some(String::from_utf8(bytes).map_err(|error| Error::InvalidInput(error.to_string()))?)
    } else {
      None
    };
    let empty = format!(
      "{HEADER}\n{{\n    generic_data_type = \"panorama_image_list\"\n    image_list =\n    [\n    ]\n}}\n"
    );
    let reconciled = reconcile_images(original.as_deref().unwrap_or(&empty), &images)
      .map_err(|error| Error::InvalidInput(format!("Cannot update {}: {error}", path.display())))?;
    if let Some(updated) = reconciled {
      edits.push((path, original, updated));
    } else if original.is_none() {
      edits.push((path, None, empty));
    }
  }
  let mut updated = Vec::new();
  for (path, original, text) in edits {
    if let Some(original) = original {
      if std::fs::read(&path)? != original.as_bytes() {
        return Err(Error::InvalidInput(
          "image_compiler.vdata changed during the update; refresh and retry".into(),
        ));
      }
    } else if path.exists() {
      return Err(Error::InvalidInput(
        "image_compiler.vdata was created during the update; refresh and retry".into(),
      ));
    }
    modding_edits::write_atomic(&path, text.as_bytes())?;
    updated.push(path);
  }
  Ok(updated)
}

#[cfg(test)]
mod image_compiler_tests {
  use super::*;

  #[test]
  fn image_inventory_preserves_case_insensitive_panorama_folder_matching() {
    let root = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(root.path().join("Panorama/Images/nested")).unwrap();
    std::fs::write(
      root.path().join("Panorama/Images/nested/Icon.PNG"),
      b"image",
    )
    .unwrap();
    sync(root.path()).unwrap();
    let compiler =
      std::fs::read_to_string(root.path().join("panorama/image_compiler.vdata")).unwrap();
    assert!(compiler.contains("file://{images}/nested/Icon.PNG"));
  }

  #[test]
  fn moving_an_image_out_of_images_removes_its_compiler_entry() {
    let root = tempfile::tempdir().unwrap();
    write(
      root.path(),
      "panorama/images/gltf_embedded_3.png",
      "fixture",
    );
    write(root.path(), "models/model.vmdl", "fixture");
    sync(root.path()).unwrap();
    std::fs::rename(
      root.path().join("panorama/images/gltf_embedded_3.png"),
      root.path().join("models/gltf_embedded_3.png"),
    )
    .unwrap();
    sync(root.path()).unwrap();
    let source =
      std::fs::read_to_string(root.path().join("panorama/image_compiler.vdata")).unwrap();
    assert!(
      !source.contains("gltf_embedded_3.png"),
      "Moved-out image still registered: {source}"
    );
  }

  #[test]
  fn an_empty_project_gets_an_empty_compiler_and_a_deleted_compiler_is_recreated() {
    let root = tempfile::tempdir().unwrap();
    let compiler = root.path().join("panorama/image_compiler.vdata");
    sync(root.path()).unwrap();
    assert!(compiler.is_file());
    std::fs::remove_file(&compiler).unwrap();
    sync(root.path()).unwrap();
    assert!(compiler.is_file());
  }

  #[test]
  fn renaming_and_deleting_an_entire_image_folder_reconciles_the_list() {
    let root = tempfile::tempdir().unwrap();
    write(root.path(), "panorama/images/old/icon.png", "fixture");
    sync(root.path()).unwrap();
    std::fs::rename(
      root.path().join("panorama/images/old"),
      root.path().join("panorama/images/new"),
    )
    .unwrap();
    sync(root.path()).unwrap();
    let compiler = root.path().join("panorama/image_compiler.vdata");
    let source = std::fs::read_to_string(&compiler).unwrap();
    assert!(source.contains("file://{images}/new/icon.png"));
    assert!(!source.contains("file://{images}/old/icon.png"));
    std::fs::remove_dir_all(root.path().join("panorama/images")).unwrap();
    sync(root.path()).unwrap();
    let source = std::fs::read_to_string(compiler).unwrap();
    let tree = modding_source::tree(&source).unwrap();
    assert!(
      tree
        .get("image_list")
        .unwrap()
        .as_array()
        .unwrap()
        .is_empty()
    );
  }

  #[test]
  fn removes_stale_and_duplicate_entries_from_the_managed_list() {
    let root = tempfile::tempdir().unwrap();
    write(root.path(), "panorama/images/icon.png", "fixture");
    write(
      root.path(),
      "image_compiler.vdata",
      "{generic_data_type=\"panorama_image_list\" image_list=[panorama:\"file://{images}/icon.png\",panorama:\"file://{images}/icon.png\",panorama:\"file://{images}/removed.png\"]}",
    );
    sync(root.path()).unwrap();
    let source = std::fs::read_to_string(root.path().join("image_compiler.vdata")).unwrap();
    let tree = modding_source::tree(&source).unwrap();
    let entries = tree.get("image_list").unwrap().as_array().unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].as_string(), Some("file://{images}/icon.png"));
  }

  fn write(root: &Path, path: &str, text: &str) {
    let file = root.join(path);
    std::fs::create_dir_all(file.parent().unwrap()).unwrap();
    std::fs::write(file, text).unwrap();
  }

  #[test]
  fn adds_nested_images_creates_the_panorama_list_and_is_idempotent() {
    let root = tempfile::tempdir().unwrap();
    sync(root.path()).unwrap();
    for image in [
      "panorama/images/hud/ability.psd",
      "panorama/images/heroes/name.svg",
      "panorama/images/new icon.PNG",
      "models/texture.png",
      "images/wrong.png",
      "panorama/images_old/wrong.png",
      "panorama/images/source.vtex_c",
    ] {
      write(root.path(), image, "fixture");
    }
    let compiler = root.path().join("panorama/image_compiler.vdata");
    assert_eq!(
      sync(root.path()).unwrap().as_slice(),
      std::slice::from_ref(&compiler)
    );
    let source = std::fs::read_to_string(&compiler).unwrap();
    assert!(source.starts_with(HEADER));
    let tree = modding_source::tree(&source).unwrap();
    let entries = tree.get("image_list").unwrap().as_array().unwrap();
    assert_eq!(entries.len(), 3);
    assert!(source.contains("panorama:\"file://{images}/hud/ability.psd\""));
    assert!(source.contains("panorama:\"file://{images}/new icon.PNG\""));
    assert!(sync(root.path()).unwrap().is_empty());
    assert_eq!(std::fs::read_to_string(&compiler).unwrap(), source);
    write(root.path(), "panorama/images/added later.png", "fixture");
    assert_eq!(
      sync(root.path()).unwrap().as_slice(),
      std::slice::from_ref(&compiler)
    );
    assert!(
      std::fs::read_to_string(compiler)
        .unwrap()
        .contains("file://{images}/added later.png")
    );
  }

  #[test]
  fn reconciles_root_compiler_entries_preserving_other_fields_bom_and_line_endings() {
    let root = tempfile::tempdir().unwrap();
    let source = format!(
      "\u{feff}{HEADER}\r\n{{\r\n    // image_list = [fake]\r\n    note = \"image_list\"\r\n    generic_data_type = \"panorama_image_list\"\r\n    image_list =\r\n    [\r\n        panorama:\"file://{{images}}/HUD/Existing.PNG\", // keep custom reference\r\n        panorama:\"file://{{images}}/basegame/not_in_addon.psd\"\r\n    ]\r\n    custom_setting = true\r\n}}\r\n"
    );
    write(root.path(), "image_compiler.vdata", &source);
    write(root.path(), "panorama/images/hud/existing.png", "fixture");
    write(root.path(), "panorama/images/hud/new.png", "fixture");
    sync(root.path()).unwrap();
    assert!(!root.path().join("panorama/image_compiler.vdata").exists());
    let updated = std::fs::read_to_string(root.path().join("image_compiler.vdata")).unwrap();
    assert!(updated.starts_with(&format!("\u{feff}{HEADER}\r\n")));
    assert!(updated.contains("// image_list = [fake]\r\n    note = \"image_list\""));
    assert!(updated.contains("custom_setting = true"));
    assert!(!updated.contains("basegame/not_in_addon.psd"));
    assert!(updated.contains("file://{images}/hud/new.png"));
    assert!(!updated.replace("\r\n", "").contains('\n'));
    assert!(sync(root.path()).unwrap().is_empty());
  }

  #[test]
  fn supports_inline_empty_arrays_and_escaped_filenames() {
    let source = "{ generic_data_type = \"panorama_image_list\" image_list=[] }";
    let updated = reconcile_images(source, &["file://{images}/a\"b.png".into()])
      .unwrap()
      .unwrap();
    let tree = modding_source::tree(&updated).unwrap();
    assert_eq!(
      tree.get("image_list").unwrap().as_array().unwrap()[0].as_string(),
      Some("file://{images}/a\"b.png")
    );
  }

  #[test]
  fn validates_all_existing_compilers_before_writing_either_one() {
    let root = tempfile::tempdir().unwrap();
    let valid = "{generic_data_type=\"panorama_image_list\" image_list=[]}";
    write(root.path(), "panorama/images/new.png", "fixture");
    write(root.path(), "image_compiler.vdata", valid);
    write(root.path(), "panorama/image_compiler.vdata", "{broken=");
    assert!(sync(root.path()).is_err());
    assert_eq!(
      std::fs::read_to_string(root.path().join("image_compiler.vdata")).unwrap(),
      valid
    );
    assert_eq!(
      std::fs::read_to_string(root.path().join("panorama/image_compiler.vdata")).unwrap(),
      "{broken="
    );
    write(root.path(), "panorama/image_compiler.vdata", valid);
    assert_eq!(sync(root.path()).unwrap().len(), 2);
  }

  #[cfg(unix)]
  #[test]
  fn does_not_read_external_images_or_write_external_compiler_links() {
    let root = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    write(root.path(), "panorama/images/local.png", "fixture");
    write(outside.path(), "private.png", "fixture");
    let original = "{generic_data_type=\"panorama_image_list\" image_list=[]}";
    write(outside.path(), "image_compiler.vdata", original);
    std::os::unix::fs::symlink(outside.path(), root.path().join("panorama/images/external"))
      .unwrap();
    sync(root.path()).unwrap();
    let compiler =
      std::fs::read_to_string(root.path().join("panorama/image_compiler.vdata")).unwrap();
    assert!(!compiler.contains("private.png"));
    std::os::unix::fs::symlink(
      outside.path().join("image_compiler.vdata"),
      root.path().join("image_compiler.vdata"),
    )
    .unwrap();
    assert!(sync(root.path()).is_err());
    assert_eq!(
      std::fs::read_to_string(outside.path().join("image_compiler.vdata")).unwrap(),
      original
    );
  }
}
