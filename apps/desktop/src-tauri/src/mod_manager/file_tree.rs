use crate::errors::Error;
use crate::mod_manager::{
  archive_extractor::ArchiveExtractor, filesystem_helper::FileSystemHelper,
};
use log;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use tempfile;

const QUALIFIER_MAX_CHARS: usize = 48;

/// Represents a single file in a mod archive
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ModFile {
  pub name: String,
  pub path: String,
  pub size: u64,
  pub is_selected: bool,
  pub archive_name: String,
}

/// Simple file tree structure for mod archives
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ModFileTree {
  pub files: Vec<ModFile>,
  pub total_files: usize,
  pub has_multiple_files: bool,
}

impl ModFileTree {
  pub fn from_options(
    available_originals: &[String],
    selected_originals: &std::collections::HashSet<String>,
  ) -> Self {
    let files: Vec<ModFile> = available_originals
      .iter()
      .map(|name| ModFile {
        name: name.clone(),
        path: name.clone(),
        size: 0,
        is_selected: selected_originals.contains(name),
        archive_name: String::new(),
      })
      .collect();
    let total_files = files.len();
    Self {
      files,
      total_files,
      has_multiple_files: total_files > 1,
    }
  }

  /// The tree's file order is the mod's load order: an earlier file gets the
  /// lower pak number, so it wins over later files of the same mod. The sort
  /// is stable, and items the tree doesn't list keep their order after it.
  pub fn sort_in_load_order<T>(&self, items: &mut [T], name_of: impl Fn(&T) -> &str) {
    let positions: HashMap<&str, usize> = self
      .files
      .iter()
      .enumerate()
      .map(|(index, file)| (file.name.as_str(), index))
      .collect();
    items.sort_by_key(|item| positions.get(name_of(item)).copied().unwrap_or(usize::MAX));
  }

  /// A file's `name` is what it installs as (`{mod_id}_{name}`), so it must be
  /// unique within the mod: variant archives usually all ship `pak01_dir.vpk`.
  /// Names come from the archives and paths alone, claimed in a fixed order,
  /// so any tree of the same files gives the same names.
  pub fn from_extracted(mut files: Vec<ModFile>) -> Self {
    let mut counts: HashMap<String, usize> = HashMap::new();
    for file in &files {
      *counts
        .entry(source_file_name(file).to_lowercase())
        .or_default() += 1;
    }

    let mut order: Vec<usize> = (0..files.len()).collect();
    order.sort_by_cached_key(|&index| {
      let file = &files[index];
      (file.archive_name.clone(), relative_path(file))
    });
    let mut taken = HashSet::new();
    for index in order {
      let file = &mut files[index];
      let file_name = source_file_name(file);
      let candidate = if counts[&file_name.to_lowercase()] > 1 {
        variant_vpk_name(file)
      } else {
        file_name.to_string()
      };
      // Archives whose names reduce to the same qualifier still need distinct files.
      file.name = claim_unique_vpk_name(&mut taken, &candidate);
    }

    let total_files = files.len();
    Self {
      files,
      total_files,
      has_multiple_files: total_files > 1,
    }
  }
}

/// `taken` holds lowercase names: Windows treats names differing in case as one file.
pub(crate) fn claim_unique_vpk_name(taken: &mut HashSet<String>, candidate: &str) -> String {
  vpk_name_candidates(candidate)
    .find(|name| taken.insert(name.to_lowercase()))
    .expect("numbered names never run out")
}

pub(crate) fn vpk_name_candidates(name: &str) -> impl Iterator<Item = String> + '_ {
  std::iter::once(name.to_string())
    .chain((2..).map(move |number| qualify_vpk_name(name, &number.to_string())))
}

/// A value is safe to use as a file name only if it is exactly one plain
/// component ending in `.vpk`, with no characters Windows forbids (a `:` would
/// write an alternate data stream instead of a file).
pub fn is_plain_vpk_name(name: &str) -> bool {
  !name.is_empty()
    && !name.contains('/')
    && !name.contains('\\')
    && !name
      .chars()
      .any(|c| c.is_control() || r#"<>:"|?*"#.contains(c))
    && Path::new(name).file_name().and_then(|n| n.to_str()) == Some(name)
    && name.to_ascii_lowercase().ends_with(".vpk")
}

pub(crate) fn source_file_name(file: &ModFile) -> &str {
  let name = path_file_name(&file.path);
  if name.is_empty() { &file.name } else { name }
}

fn path_file_name(path: &str) -> &str {
  path.rsplit(['/', '\\']).next().unwrap_or(path)
}

/// Works the source archive and folders into the name, e.g. `pak01_dir.vpk`
/// from `Red Skin.zip` becomes `pak01-red-skin_dir.vpk`. The `_dir.vpk` ending
/// stays because other managers only scan for that.
pub(crate) fn variant_vpk_name(file: &ModFile) -> String {
  let archive_name = file.archive_name.as_str();
  let relative = relative_path(file);
  let archive_stem = Path::new(archive_name)
    .file_stem()
    .and_then(|stem| stem.to_str())
    .unwrap_or_default();
  let folders = relative.rsplit_once('/').map_or("", |(folders, _)| folders);
  qualify_vpk_name(
    source_file_name(file),
    &slug(&format!("{archive_stem} {folders}")),
  )
}

/// The file's path inside its archive, whether or not `path` starts with the
/// archive's folder.
pub(crate) fn relative_path(file: &ModFile) -> String {
  let path = file.path.replace('\\', "/");
  path
    .strip_prefix(&format!("{}/", file.archive_name))
    .map_or_else(|| path.clone(), str::to_string)
}

/// Whether `name` is `file`'s own file name or one qualified from it, e.g.
/// `pak01-red_dir.vpk` for any `pak01_dir.vpk`.
pub(crate) fn is_name_from_source_of(name: &str, file: &ModFile) -> bool {
  let name = name.to_ascii_lowercase();
  let file_name = source_file_name(file).to_ascii_lowercase();
  name == file_name
    || ["_dir.vpk", ".vpk"]
      .into_iter()
      .find(|suffix| file_name.ends_with(suffix))
      .is_some_and(|suffix| {
        let stem = &file_name[..file_name.len() - suffix.len()];
        name
          .strip_prefix(&format!("{stem}-"))
          .and_then(|rest| rest.strip_suffix(suffix))
          .is_some_and(|qualifier| !qualifier.is_empty())
      })
}

fn qualify_vpk_name(file_name: &str, qualifier: &str) -> String {
  if qualifier.is_empty() {
    return file_name.to_string();
  }
  let lower = file_name.to_ascii_lowercase();
  for suffix in ["_dir.vpk", ".vpk"] {
    if lower.ends_with(suffix) {
      let (stem, ending) = file_name.split_at(file_name.len() - suffix.len());
      return format!("{stem}-{qualifier}{ending}");
    }
  }
  format!("{file_name}-{qualifier}")
}

// Not `slugify`: that one is ASCII-only for portable exports, and here
// non-Latin archive names still need distinct, reproducible qualifiers.
fn slug(text: &str) -> String {
  let mut slug = String::new();
  for c in text.chars() {
    if c.is_alphanumeric() {
      slug.extend(c.to_lowercase());
    } else if !slug.is_empty() && !slug.ends_with('-') {
      slug.push('-');
    }
  }
  let slug: String = slug.chars().take(QUALIFIER_MAX_CHARS).collect();
  slug.trim_end_matches('-').to_string()
}

/// Simple file tree analyzer that just lists files without grouping
pub struct FileTreeAnalyzer {
  archive_extractor: ArchiveExtractor,
  filesystem: FileSystemHelper,
}

impl FileTreeAnalyzer {
  pub fn new() -> Self {
    Self {
      archive_extractor: ArchiveExtractor::new(),
      filesystem: FileSystemHelper::new(),
    }
  }

  /// Gets the simple file structure from an already-extracted directory
  pub fn get_file_tree_from_extracted(
    &self,
    extracted_path: &Path,
    archive_name: &str,
  ) -> Result<ModFileTree, Error> {
    log::info!(
      "Getting file tree from extracted path: {extracted_path:?} (archive: {archive_name})"
    );

    // Find all VPK files recursively
    let vpk_files = self
      .filesystem
      .find_files_recursive(extracted_path, "vpk")?;

    log::info!(
      "Found {} VPK files in extracted archive: {archive_name:?}",
      vpk_files.len()
    );

    let mut all_files = Vec::new();

    // Convert to ModFile objects
    for (path, size) in vpk_files {
      let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown.vpk")
        .to_string();

      let relative_path = path
        .strip_prefix(extracted_path)
        .unwrap_or(&path)
        .to_string_lossy()
        .to_string();

      all_files.push(ModFile {
        name: file_name,
        path: relative_path,
        size,
        is_selected: true, // Default to selected
        archive_name: archive_name.to_string(),
      });
    }

    let tree = ModFileTree::from_extracted(all_files);
    log::info!(
      "File tree analysis complete: {} files, has_multiple: {}",
      tree.total_files,
      tree.has_multiple_files
    );
    Ok(tree)
  }

  /// Gets the simple file structure from archive(s) in a directory
  pub fn get_mod_file_tree(&self, mod_path: &PathBuf) -> Result<ModFileTree, Error> {
    log::info!("Getting file tree for mod path: {mod_path:?}");

    let mut all_files = Vec::new();

    // Process all archives found in the mod directory
    for entry in std::fs::read_dir(mod_path)? {
      let entry = entry?;
      let archive_path = entry.path();

      if !self.archive_extractor.is_supported_archive(&archive_path) {
        continue;
      }

      let archive_name = archive_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

      let temp_dir = tempfile::tempdir()?;
      log::info!("Extracting archive for analysis: {archive_path:?}");

      // Extract archive to temporary location
      self
        .archive_extractor
        .extract_archive(&archive_path, temp_dir.path())?;

      // Find all VPK files recursively
      let vpk_files = self
        .filesystem
        .find_files_recursive(temp_dir.path(), "vpk")?;

      log::info!(
        "Found {} VPK files in archive: {archive_name:?}",
        vpk_files.len()
      );

      // Convert to ModFile objects
      for (path, size) in vpk_files {
        let file_name = path
          .file_name()
          .and_then(|n| n.to_str())
          .unwrap_or("unknown.vpk")
          .to_string();

        let relative_path = path
          .strip_prefix(temp_dir.path())
          .unwrap_or(&path)
          .to_string_lossy()
          .to_string();

        all_files.push(ModFile {
          name: file_name,
          path: relative_path,
          size,
          is_selected: true, // Default to selected
          archive_name: archive_name.clone(),
        });
      }
    }

    let tree = ModFileTree::from_extracted(all_files);
    log::info!(
      "File tree analysis complete: {} files, has_multiple: {}",
      tree.total_files,
      tree.has_multiple_files
    );
    Ok(tree)
  }
}

impl Default for FileTreeAnalyzer {
  fn default() -> Self {
    Self::new()
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn file(archive_name: &str, path: &str) -> ModFile {
    ModFile {
      name: path_file_name(path).to_string(),
      path: path.to_string(),
      size: 0,
      is_selected: true,
      archive_name: archive_name.to_string(),
    }
  }

  fn names(tree: &ModFileTree) -> Vec<&str> {
    tree.files.iter().map(|file| file.name.as_str()).collect()
  }

  #[test]
  fn plain_vpk_names() {
    assert!(is_plain_vpk_name("pak01_dir.vpk"));
    assert!(!is_plain_vpk_name("../pak01_dir.vpk"));
    assert!(!is_plain_vpk_name("readme.txt"));
    assert!(!is_plain_vpk_name("ab:cd.vpk"));
    assert!(!is_plain_vpk_name("a?.vpk"));
  }

  #[test]
  fn variants_in_separate_archives_get_distinct_names() {
    let tree = ModFileTree::from_extracted(vec![
      file("Yamato Red.zip", "Yamato Red.zip/pak01_dir.vpk"),
      file("Yamato Blue.zip", "Yamato Blue.zip/pak01_dir.vpk"),
      file("Yamato Blue.zip", "Yamato Blue.zip/pak02_dir.vpk"),
    ]);
    assert_eq!(
      names(&tree),
      [
        "pak01-yamato-red_dir.vpk",
        "pak01-yamato-blue_dir.vpk",
        "pak02_dir.vpk"
      ]
    );
  }

  #[test]
  fn variants_in_folders_of_one_archive_get_distinct_names() {
    let tree = ModFileTree::from_extracted(vec![
      file("skins.7z", "Variant 1/pak01_dir.vpk"),
      file("skins.7z", "Variant 2\\pak01_dir.vpk"),
    ]);
    assert_eq!(
      names(&tree),
      [
        "pak01-skins-variant-1_dir.vpk",
        "pak01-skins-variant-2_dir.vpk"
      ]
    );
  }

  #[test]
  fn names_do_not_depend_on_the_archive_prefix_or_rebuilding() {
    let prefixed = ModFileTree::from_extracted(vec![
      file("a.zip", "a.zip/pak01_dir.vpk"),
      file("b.zip", "b.zip/pak01_dir.vpk"),
    ]);
    let bare = ModFileTree::from_extracted(vec![
      file("a.zip", "pak01_dir.vpk"),
      file("b.zip", "pak01_dir.vpk"),
    ]);
    let rebuilt = ModFileTree::from_extracted(prefixed.files.clone());
    assert_eq!(names(&prefixed), names(&bare));
    assert_eq!(names(&prefixed), names(&rebuilt));
  }

  #[test]
  fn archives_with_the_same_qualifier_still_get_distinct_names() {
    let zip = file("Red.zip", "Red.zip/pak01_dir.vpk");
    let rar = file("red.rar", "red.rar/PAK01_dir.vpk");
    let tree = ModFileTree::from_extracted(vec![zip.clone(), rar.clone()]);
    assert_eq!(names(&tree), ["pak01-red_dir.vpk", "PAK01-red-2_dir.vpk"]);

    let reversed = ModFileTree::from_extracted(vec![rar, zip]);
    assert_eq!(
      names(&reversed),
      ["PAK01-red-2_dir.vpk", "pak01-red_dir.vpk"]
    );
  }

  #[test]
  fn variant_names_include_the_archive_and_folders() {
    assert_eq!(
      variant_vpk_name(&file("Red Skin.zip", "pak01_dir.vpk")),
      "pak01-red-skin_dir.vpk"
    );
    assert_eq!(
      variant_vpk_name(&file("Red Skin.zip", "Red Skin.zip/hd/model.vpk")),
      "model-red-skin-hd.vpk"
    );
  }
}
