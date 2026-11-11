use crate::errors::Error;
use crate::mod_manager::archive_extractor::{
  extraction_budget, is_zip_directory, relative_entry_path, too_large,
};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::path::{Path, PathBuf};

/// Windows refuses longer paths unless they are written in verbatim form,
/// counting the folder an archive is extracted into, so a listing leaves
/// anything near that to an extraction.
const MAX_LISTED_PATH_BYTES: usize = 512;

/// The files an archive would extract and their sizes, read from its index
/// without writing anything. Refuses what extraction refuses: unsafe names,
/// and declared sizes past the extraction budget.
///
/// `None` means only an extraction can tell which files land on disk: RAR,
/// whose links `unrar` can't tell apart from files, and names a filesystem
/// may merge or rewrite (see `is_plain_listing`).
pub fn list_files(archive_path: &Path) -> Result<Option<Vec<(PathBuf, u64)>>, Error> {
  let entries = match archive_path.extension().and_then(|e| e.to_str()) {
    Some("zip") => list_zip(archive_path)?,
    Some("7z") => match list_7z(archive_path)? {
      Some(entries) => entries,
      None => return Ok(None),
    },
    _ => return Ok(None),
  };

  let mut files = Vec::new();
  let mut folders = Vec::new();
  for entry in entries {
    let path = relative_entry_path(&entry.name)?;
    if entry.is_dir {
      folders.push(path);
    } else {
      files.push((path, entry.size));
    }
  }
  if !is_plain_listing(&files, &folders) {
    return Ok(None);
  }

  let budget = extraction_budget(fs::metadata(archive_path)?.len());
  let declared = files
    .iter()
    .try_fold(0u64, |total, (_, size)| total.checked_add(*size));
  if declared.is_none_or(|total| total > budget) {
    return Err(too_large().into());
  }

  Ok(Some(files))
}

/// An entry as an archive's index declares it.
struct ListedEntry {
  name: String,
  is_dir: bool,
  size: u64,
}

fn list_zip(archive_path: &Path) -> Result<Vec<ListedEntry>, Error> {
  let mut archive = zip::ZipArchive::new(File::open(archive_path)?)?;
  (0..archive.len())
    .map(|i| {
      let file = archive.by_index(i)?;
      Ok(ListedEntry {
        name: file.name().to_string(),
        is_dir: is_zip_directory(file.name()),
        size: file.size(),
      })
    })
    .collect()
}

fn list_7z(archive_path: &Path) -> Result<Option<Vec<ListedEntry>>, Error> {
  let reader = sevenz_rust2::ArchiveReader::open(archive_path, sevenz_rust2::Password::empty())
    .map_err(|e| Error::ModExtractionFailed(e.to_string()))?;
  let archive = reader.archive();

  // `sevenz_rust2` walks a solid block by counting its streams, so an entry
  // without data stored inside a block changes which entries it writes. This
  // depends on the reader's walk, not a documented contract: recheck it when
  // upgrading the crate.
  let has_empty_entry_in_block = archive
    .files
    .iter()
    .zip(&archive.stream_map.file_block_index)
    .any(|(entry, block)| !entry.has_stream() && block.is_some());
  if has_empty_entry_in_block {
    return Ok(None);
  }

  Ok(Some(
    archive
      .files
      .iter()
      .map(|entry| ListedEntry {
        name: entry.name().to_string(),
        is_dir: entry.is_directory(),
        size: entry.size(),
      })
      .collect(),
  ))
}

/// Whether every listed path lands on disk exactly as named, on Windows and
/// Linux. NTFS keeps one file for names that differ only in case, and Windows
/// rewrites trailing dots and spaces, device names and `:` streams. Instead of
/// reproducing those rules, an archive that could meet one is extracted, so
/// the disk decides as before.
fn is_plain_listing(files: &[(PathBuf, u64)], folders: &[PathBuf]) -> bool {
  // Lowercase path to its first spelling. Names are ASCII by then, so ASCII
  // lowercasing is all the case folding NTFS can do to them.
  let mut folder_spellings: HashMap<String, &str> = HashMap::new();
  let mut file_keys = HashSet::new();

  let paths = files
    .iter()
    .map(|(path, _)| (path, false))
    .chain(folders.iter().map(|path| (path, true)));
  for (path, is_dir) in paths {
    let Some(text) = path
      .to_str()
      .filter(|text| text.len() <= MAX_LISTED_PATH_BYTES)
    else {
      return false;
    };
    if !path
      .iter()
      .all(|name| name.to_str().is_some_and(is_plain_name))
    {
      return false;
    }

    let own_folders = path
      .ancestors()
      .skip(usize::from(!is_dir))
      .filter_map(Path::to_str)
      .filter(|folder| !folder.is_empty());
    for folder in own_folders {
      let first_spelling = *folder_spellings
        .entry(folder.to_ascii_lowercase())
        .or_insert(folder);
      if first_spelling != folder {
        return false;
      }
    }

    if !is_dir && !file_keys.insert(text.to_ascii_lowercase()) {
      return false;
    }
  }

  file_keys
    .iter()
    .all(|file| !folder_spellings.contains_key(file))
}

/// A name Windows and Linux both store as written: ASCII, since NTFS also
/// folds the case of other letters; at most 255 bytes; and no `~`, because
/// Windows short names (`PAK01_~1.VPK`) can alias another file.
fn is_plain_name(name: &str) -> bool {
  if name.len() > 255
    || !name.is_ascii()
    || name.ends_with(['.', ' '])
    || name
      .bytes()
      .any(|b| b.is_ascii_control() || br#"<>:"|?*~"#.contains(&b))
  {
    return false;
  }

  let stem = name.split('.').next().unwrap_or(name).trim_end_matches(' ');
  let is_device_name = ["CON", "PRN", "AUX", "NUL", "CONIN$", "CONOUT$"]
    .iter()
    .any(|device| stem.eq_ignore_ascii_case(device))
    || (stem.len() == 4
      && ["COM", "LPT"]
        .iter()
        .any(|device| stem[..3].eq_ignore_ascii_case(device))
      && stem.as_bytes()[3].is_ascii_digit());
  !is_device_name
}
