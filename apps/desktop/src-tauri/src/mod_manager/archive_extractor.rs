use crate::errors::Error;
use log;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::fs::File;
use std::io::Read;
use std::path::{Component, Path, PathBuf};

/// How far an archive may expand. Archives come from remote sites, so a small
/// one must not be able to fill the disk. Popular GameBanana mods expand about
/// 3x and at most 26x, while a zip bomb expands thousands of times.
const MAX_EXPANSION_RATIO: u64 = 100;
/// Small archives always get this much, so a tiny mod that compresses well
/// never trips the ratio.
const MIN_EXTRACTED_BYTES: u64 = 256 * 1024 * 1024;
const MAX_EXTRACTED_BYTES: u64 = 16 * 1024 * 1024 * 1024;
/// macOS refuses paths past 1024 bytes, counting the folder an archive is
/// extracted into, so a listing leaves anything near that to an extraction.
const MAX_LISTED_PATH_BYTES: usize = 512;

fn extraction_budget(archive_size: u64) -> u64 {
  archive_size
    .saturating_mul(MAX_EXPANSION_RATIO)
    .clamp(MIN_EXTRACTED_BYTES, MAX_EXTRACTED_BYTES)
}

fn too_large() -> std::io::Error {
  std::io::Error::other("Archive expands beyond the extraction size limit")
}

/// Counts bytes against the archive's budget as they are written, so the
/// limit holds whatever sizes the archive's headers claim.
struct Budgeted<'a, R> {
  inner: R,
  remaining: &'a mut u64,
}

impl<R: Read> Read for Budgeted<'_, R> {
  fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
    let read = self.inner.read(buf)?;
    *self.remaining = self
      .remaining
      .checked_sub(read as u64)
      .ok_or_else(too_large)?;
    Ok(read)
  }
}

/// Handles extraction of different archive formats
pub struct ArchiveExtractor;

impl ArchiveExtractor {
  pub fn new() -> Self {
    Self
  }

  /// Extract archive based on file extension
  pub fn extract_archive(&self, archive_path: &Path, output_dir: &Path) -> Result<(), Error> {
    log::info!("Extracting archive: {archive_path:?} to {output_dir:?}");

    // `sanitize_path` canonicalizes the output directory, so it has to exist before the
    // first entry is resolved.
    fs::create_dir_all(output_dir)?;

    let budget = extraction_budget(fs::metadata(archive_path)?.len());

    match archive_path.extension().and_then(|e| e.to_str()) {
      Some("zip") => self.extract_zip(archive_path, output_dir, budget),
      Some("rar") => self.extract_rar(archive_path, output_dir, budget),
      Some("7z") => self.extract_7z(archive_path, output_dir, budget),
      Some(ext) => Err(Error::ModExtractionFailed(format!(
        "Unsupported archive format: {ext}"
      ))),
      None => Err(Error::ModExtractionFailed(
        "Could not determine archive format".to_string(),
      )),
    }?;

    self.validate_extracted_files(output_dir)
  }

  /// The files an archive would extract and their sizes, read from its index
  /// without writing anything. Refuses what extraction refuses: unsafe names,
  /// and declared sizes past the extraction budget.
  ///
  /// `None` means only an extraction can tell which files land on disk: RAR,
  /// whose links `unrar` can't tell apart from files, and names a filesystem
  /// may merge or rewrite (see `is_plain_listing`).
  pub fn list_files(&self, archive_path: &Path) -> Result<Option<Vec<(PathBuf, u64)>>, Error> {
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

  /// Resolve an archive entry name into a path inside `output_dir`.
  fn sanitize_path(&self, entry_name: &str, output_dir: &Path) -> Result<PathBuf, Error> {
    let resolved = output_dir.join(relative_entry_path(entry_name)?);
    self.assert_within_directory(&resolved, output_dir)?;

    Ok(resolved)
  }

  /// Confirm `resolved` lands inside `output_dir`. A relative path can still escape when
  /// one of the directories it sits under is a symlink or junction.
  fn assert_within_directory(&self, resolved: &Path, output_dir: &Path) -> Result<(), Error> {
    let canonical_output = output_dir
      .canonicalize()
      .map_err(|_| Error::UnauthorizedPath("Unable to resolve output directory".to_string()))?;

    let existing_ancestor = resolved
      .ancestors()
      .find(|ancestor| ancestor.exists())
      .ok_or_else(|| {
        Error::UnauthorizedPath(format!("Unable to resolve path: {}", resolved.display()))
      })?;

    let canonical_ancestor = existing_ancestor.canonicalize().map_err(|_| {
      Error::UnauthorizedPath(format!(
        "Unable to resolve path: {}",
        existing_ancestor.display()
      ))
    })?;

    if !canonical_ancestor.starts_with(&canonical_output) {
      return Err(Error::UnauthorizedPath(format!(
        "Archive path '{}' would extract outside target directory",
        resolved.display()
      )));
    }

    Ok(())
  }

  /// Extract ZIP archive
  fn extract_zip(
    &self,
    archive_path: &Path,
    output_dir: &Path,
    mut remaining: u64,
  ) -> Result<(), Error> {
    let zip_file = File::open(archive_path)?;
    let mut archive = zip::ZipArchive::new(zip_file)?;

    for i in 0..archive.len() {
      let mut file = archive.by_index(i)?;

      // Sanitize the file path to prevent Zip Slip attacks
      let outpath = self.sanitize_path(file.name(), output_dir)?;

      if let Some(parent) = outpath.parent() {
        fs::create_dir_all(parent)?;
      }

      if !file.name().ends_with('/') {
        let mut outfile = fs::File::create(&outpath)?;
        let mut budgeted = Budgeted {
          inner: &mut file,
          remaining: &mut remaining,
        };
        std::io::copy(&mut budgeted, &mut outfile)?;
      }
    }

    log::info!("Successfully extracted ZIP archive");
    Ok(())
  }

  /// Extract RAR archive
  fn extract_rar(
    &self,
    archive_path: &Path,
    output_dir: &Path,
    mut remaining: u64,
  ) -> Result<(), Error> {
    let mut archive =
      unrar::Archive::new(archive_path.to_string_lossy().as_ref()).open_for_processing()?;

    while let Some(header) = archive.read_header()? {
      archive = if header.entry().is_file() {
        // unrar writes the file itself and stops at the unpacked size it
        // declares, so the budget is charged from the header.
        remaining = remaining
          .checked_sub(header.entry().unpacked_size)
          .ok_or_else(too_large)?;
        let destination =
          self.sanitize_path(&header.entry().filename.to_string_lossy(), output_dir)?;

        if let Some(parent) = destination.parent() {
          fs::create_dir_all(parent)?;
        }

        header.extract_to(&destination)?
      } else {
        header.skip()?
      };
    }

    log::info!("Successfully extracted RAR archive");
    Ok(())
  }

  /// Extract 7Z archive
  fn extract_7z(
    &self,
    archive_path: &Path,
    output_dir: &Path,
    mut remaining: u64,
  ) -> Result<(), Error> {
    let mut reader =
      sevenz_rust2::ArchiveReader::open(archive_path, sevenz_rust2::Password::empty())
        .map_err(|e| Error::ModExtractionFailed(e.to_string()))?;

    // The header lists every entry, so the archive is rejected before anything is written.
    // Checking afterwards cannot work: an escaped file is not under output_dir. Resolving
    // here also keeps `UnauthorizedPath` intact, which extraction errors cannot carry.
    let destinations = reader
      .archive()
      .files
      .iter()
      .map(|entry| {
        Ok((
          entry.name().to_string(),
          self.sanitize_path(entry.name(), output_dir)?,
        ))
      })
      .collect::<Result<HashMap<_, _>, Error>>()?;

    // Write to the path we resolved rather than the one the library computes.
    reader
      .for_each_entries(|entry, reader| {
        let destination = destinations.get(entry.name()).ok_or_else(|| {
          sevenz_rust2::Error::Other("entry is missing from the archive header".into())
        })?;

        let mut budgeted = Budgeted {
          inner: reader,
          remaining: &mut remaining,
        };
        sevenz_rust2::default_entry_extract_fn(entry, &mut budgeted, destination)
      })
      .map_err(|e| Error::ModExtractionFailed(e.to_string()))?;

    log::info!("Successfully extracted 7Z archive");
    Ok(())
  }

  /// Validate that all extracted files are within the expected output directory. Entry names
  /// are already checked before each write, so this only catches links an extraction library
  /// creates on its own, which today means `unrar`. It runs for every format so a format added
  /// later is covered by default.
  fn validate_extracted_files(&self, output_dir: &Path) -> Result<(), Error> {
    let canonical_output = output_dir
      .canonicalize()
      .map_err(|_| Error::UnauthorizedPath("Unable to resolve output directory".to_string()))?;

    self.validate_directory_recursive(output_dir, &canonical_output)?;
    Ok(())
  }

  /// Recursively validate that all files in a directory are within the allowed path
  fn validate_directory_recursive(&self, dir: &Path, allowed_root: &Path) -> Result<(), Error> {
    for entry in std::fs::read_dir(dir)? {
      let entry = entry?;
      let path = entry.path();

      let canonical_path = path.canonicalize().map_err(|_| {
        Error::UnauthorizedPath(format!("Unable to resolve path: {}", path.display()))
      })?;

      if !canonical_path.starts_with(allowed_root) {
        return Err(Error::UnauthorizedPath(format!(
          "File '{}' is outside the allowed extraction directory",
          canonical_path.display()
        )));
      }

      // `file_type` does not follow links, so a link cannot send this walk into a cycle.
      if entry.file_type()?.is_dir() {
        self.validate_directory_recursive(&path, allowed_root)?;
      }
    }
    Ok(())
  }

  /// Check if a file is a supported archive format
  pub fn is_supported_archive(&self, path: &Path) -> bool {
    matches!(
      path.extension().and_then(|e| e.to_str()),
      Some("zip") | Some("rar") | Some("7z")
    )
  }
}

/// Interpret an archive entry name as a relative path built only from plain file and
/// directory names. Backslashes count as separators on every platform, so a Windows-authored
/// archive is validated the same way on Linux and macOS.
fn relative_entry_path(entry_name: &str) -> Result<PathBuf, Error> {
  let normalized = entry_name.replace('\\', "/");
  let mut relative = PathBuf::new();

  for component in Path::new(&normalized).components() {
    match component {
      // `C:` only parses as a prefix in leading position, and pushing it would discard
      // everything already in the buffer, so reject a drive letter wherever it appears.
      Component::Normal(part) if starts_with_drive_letter(part.to_string_lossy().as_ref()) => {
        return Err(Error::UnauthorizedPath(format!(
          "Archive contains an absolute path: {entry_name}"
        )));
      }
      Component::Normal(part) => relative.push(part),
      Component::CurDir => {}
      Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
        return Err(Error::UnauthorizedPath(format!(
          "Archive contains unsafe path: {entry_name}"
        )));
      }
    }
  }

  if relative.as_os_str().is_empty() {
    return Err(Error::UnauthorizedPath(format!(
      "Archive contains an entry without a usable name: {entry_name}"
    )));
  }

  Ok(relative)
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
        // The same test `extract_zip` uses to skip writing an entry.
        is_dir: file.name().ends_with('/'),
        size: file.size(),
      })
    })
    .collect()
}

fn list_7z(archive_path: &Path) -> Result<Option<Vec<ListedEntry>>, Error> {
  let reader = sevenz_rust2::ArchiveReader::open(archive_path, sevenz_rust2::Password::empty())
    .map_err(|e| Error::ModExtractionFailed(e.to_string()))?;
  let archive = reader.archive();

  // The reader walks a block by counting its streams, so an entry without data
  // stored inside a block changes which entries it writes.
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

/// Whether every listed path lands on disk exactly as named, on every
/// filesystem the app runs on. Case-insensitive filesystems keep one file for
/// names that differ only in case, APFS merges Unicode normalization forms, and
/// Windows rewrites trailing dots and spaces, device names and `:` streams.
/// Instead of reproducing those rules, an archive that could meet one is
/// extracted, so the disk decides as before.
fn is_plain_listing(files: &[(PathBuf, u64)], folders: &[PathBuf]) -> bool {
  // Keyed by (parent folder id, lowercase name), the root being 0. Names are
  // ASCII by then, so that is all the case folding a filesystem can do, and
  // the keys grow with the names' length, not with their depth squared.
  let mut folders_by_name: HashMap<(usize, String), (usize, &str)> = HashMap::new();
  let mut file_names = HashSet::new();

  let paths = files
    .iter()
    .map(|(path, _)| (path, false))
    .chain(folders.iter().map(|path| (path, true)));
  for (path, is_dir) in paths {
    if path.as_os_str().len() > MAX_LISTED_PATH_BYTES {
      return false;
    }
    let Some(names) = path
      .iter()
      .map(|name| name.to_str().filter(|name| is_plain_name(name)))
      .collect::<Option<Vec<_>>>()
    else {
      return false;
    };

    let folder_depth = if is_dir { names.len() } else { names.len() - 1 };
    let mut parent = 0;
    for &name in &names[..folder_depth] {
      let next_id = folders_by_name.len() + 1;
      let (id, first_spelling) = *folders_by_name
        .entry((parent, name.to_ascii_lowercase()))
        .or_insert((next_id, name));
      if first_spelling != name {
        return false;
      }
      parent = id;
    }

    if !is_dir && !file_names.insert((parent, names[folder_depth].to_ascii_lowercase())) {
      return false;
    }
  }

  file_names
    .iter()
    .all(|file| !folders_by_name.contains_key(file))
}

/// A name every supported filesystem stores as written: none takes more than
/// 255 bytes, and `~` is out because Windows short names (`PAK01_~1.VPK`) can
/// alias another file.
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
  let is_device_name = ["CON", "PRN", "AUX", "NUL"]
    .iter()
    .any(|device| stem.eq_ignore_ascii_case(device))
    || (stem.len() == 4
      && ["COM", "LPT"]
        .iter()
        .any(|device| stem[..3].eq_ignore_ascii_case(device))
      && stem.as_bytes()[3].is_ascii_digit());
  !is_device_name
}

/// Whether `component` starts with a Windows drive specifier such as `C:`.
fn starts_with_drive_letter(component: &str) -> bool {
  let bytes = component.as_bytes();
  bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':'
}

impl Default for ArchiveExtractor {
  fn default() -> Self {
    Self::new()
  }
}

#[cfg(test)]
mod tests {
  use super::{ArchiveExtractor, MIN_EXTRACTED_BYTES, relative_entry_path};
  use crate::errors::Error;
  use std::io::Write;
  use std::path::{Path, PathBuf};

  fn assert_rejected(entry_name: &str) {
    match relative_entry_path(entry_name) {
      Err(Error::UnauthorizedPath(_)) => {}
      Err(other) => panic!("expected '{entry_name}' to be an unauthorized path, got {other:?}"),
      Ok(path) => panic!("expected '{entry_name}' to be rejected, resolved to {path:?}"),
    }
  }

  fn assert_resolves_to(entry_name: &str, expected: &str) {
    let resolved = relative_entry_path(entry_name)
      .unwrap_or_else(|e| panic!("expected '{entry_name}' to be accepted, got {e:?}"));

    assert_eq!(resolved, expected.split('/').collect::<PathBuf>());
  }

  fn assert_extraction_rejected(archive_path: &Path, output_dir: &Path) {
    let result = ArchiveExtractor::new().extract_archive(archive_path, output_dir);

    assert!(
      matches!(result, Err(Error::UnauthorizedPath(_))),
      "expected an unauthorized path error, got {result:?}"
    );
  }

  #[test]
  fn rejects_relative_traversal() {
    assert_rejected("../evil.txt");
    assert_rejected("../../evil.txt");
    assert_rejected("mods/../../evil.txt");
  }

  #[test]
  fn rejects_windows_style_traversal_on_every_platform() {
    assert_rejected("..\\evil.txt");
    assert_rejected("..\\..\\..\\evil.txt");
    assert_rejected("mods\\..\\..\\evil.txt");
  }

  #[test]
  fn rejects_absolute_paths() {
    assert_rejected("/etc/passwd");
    assert_rejected("\\Windows\\System32\\evil.dll");
    assert_rejected(
      "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Deadlock\\game\\bin\\win64\\deadlock.exe",
    );
    assert_rejected("C:evil.exe");
  }

  /// `Path::components` only reports a drive letter as a prefix in leading position, and
  /// `PathBuf::push` would then discard the output directory it is joined onto.
  #[test]
  fn rejects_drive_letters_in_any_position() {
    assert_rejected("mods/C:evil.exe");
    assert_rejected("mods/C:/Windows/System32/evil.dll");
    assert_rejected("mods\\nested\\D:evil.exe");
  }

  #[test]
  fn rejects_entries_without_a_usable_name() {
    assert_rejected("");
    assert_rejected(".");
    assert_rejected("./");
  }

  #[test]
  fn accepts_ordinary_entries() {
    assert_resolves_to("skin.vpk", "skin.vpk");
    assert_resolves_to("mods/skin.vpk", "mods/skin.vpk");
    assert_resolves_to("mods\\nested\\skin.vpk", "mods/nested/skin.vpk");
    assert_resolves_to("./mods/skin.vpk", "mods/skin.vpk");
  }

  #[test]
  fn accepts_names_that_merely_contain_dots() {
    assert_resolves_to("my..skin.vpk", "my..skin.vpk");
    assert_resolves_to("v1.2..3/skin.vpk", "v1.2..3/skin.vpk");
  }

  fn write_seven_zip(archive_path: &Path, entries: &[(&str, &[u8])]) {
    let mut writer = sevenz_rust2::ArchiveWriter::create(archive_path).unwrap();

    for (name, contents) in entries {
      writer
        .push_archive_entry(
          sevenz_rust2::ArchiveEntry::new_file(name),
          Some(std::io::Cursor::new(contents.to_vec())),
        )
        .unwrap();
    }

    writer.finish().unwrap();
  }

  fn write_zip(archive_path: &Path, entries: &[(&str, &[u8])]) {
    let mut writer = zip::ZipWriter::new(std::fs::File::create(archive_path).unwrap());

    for (name, contents) in entries {
      writer
        .start_file(*name, zip::write::SimpleFileOptions::default())
        .unwrap();
      writer.write_all(contents).unwrap();
    }

    writer.finish().unwrap();
  }

  /// A few hundred KB of zeros that expand past what the archive may unpack.
  #[test]
  fn stops_an_archive_that_expands_past_its_budget() {
    let workspace = tempfile::tempdir().unwrap();
    let archive_path = workspace.path().join("bomb.zip");
    let output_dir = workspace.path().join("extracted");
    let zeros = vec![0; MIN_EXTRACTED_BYTES as usize + 1];
    write_zip(&archive_path, &[("bomb.vpk", &zeros)]);

    let result = ArchiveExtractor::new().extract_archive(&archive_path, &output_dir);

    assert!(result.is_err(), "expected the bomb to be refused");
    let written = std::fs::metadata(output_dir.join("bomb.vpk")).map_or(0, |m| m.len());
    assert!(written <= MIN_EXTRACTED_BYTES);
  }

  #[test]
  fn seven_zip_traversal_entry_is_not_written_to_disk() {
    let workspace = tempfile::tempdir().unwrap();
    let archive_path = workspace.path().join("malicious.7z");
    let output_dir = workspace.path().join("nested").join("extracted");

    write_seven_zip(&archive_path, &[("../../escaped.txt", b"payload")]);
    assert_extraction_rejected(&archive_path, &output_dir);

    assert!(
      !workspace.path().join("escaped.txt").exists(),
      "traversal entry escaped the output directory"
    );
  }

  #[test]
  fn seven_zip_absolute_entry_is_not_written_to_disk() {
    let workspace = tempfile::tempdir().unwrap();
    let archive_path = workspace.path().join("malicious.7z");
    let output_dir = workspace.path().join("extracted");
    let escape_target = workspace.path().join("absolute.txt");

    write_seven_zip(
      &archive_path,
      &[(escape_target.to_string_lossy().as_ref(), b"payload")],
    );
    assert_extraction_rejected(&archive_path, &output_dir);

    assert!(
      !escape_target.exists(),
      "absolute entry escaped the output directory"
    );
  }

  #[test]
  fn seven_zip_ordinary_entries_still_extract() {
    let workspace = tempfile::tempdir().unwrap();
    let archive_path = workspace.path().join("mod.7z");
    let output_dir = workspace.path().join("extracted");

    write_seven_zip(
      &archive_path,
      &[
        ("pak01_dir.vpk", b"vpk contents"),
        ("nested/readme.txt", b"read me"),
      ],
    );

    ArchiveExtractor::new()
      .extract_archive(&archive_path, &output_dir)
      .unwrap();

    assert_eq!(
      std::fs::read(output_dir.join("pak01_dir.vpk")).unwrap(),
      b"vpk contents"
    );
    assert_eq!(
      std::fs::read(output_dir.join("nested").join("readme.txt")).unwrap(),
      b"read me"
    );
  }

  #[test]
  fn zip_traversal_entry_is_not_written_to_disk() {
    let workspace = tempfile::tempdir().unwrap();
    let archive_path = workspace.path().join("malicious.zip");
    let output_dir = workspace.path().join("nested").join("extracted");

    write_zip(&archive_path, &[("../../escaped.txt", b"payload")]);
    assert_extraction_rejected(&archive_path, &output_dir);

    assert!(
      !workspace.path().join("escaped.txt").exists(),
      "traversal entry escaped the output directory"
    );
  }

  #[test]
  fn zip_ordinary_entries_still_extract() {
    let workspace = tempfile::tempdir().unwrap();
    let archive_path = workspace.path().join("mod.zip");
    let output_dir = workspace.path().join("extracted");

    write_zip(
      &archive_path,
      &[
        ("pak01_dir.vpk", b"vpk contents"),
        ("nested/readme.txt", b"read me"),
      ],
    );

    ArchiveExtractor::new()
      .extract_archive(&archive_path, &output_dir)
      .unwrap();

    assert_eq!(
      std::fs::read(output_dir.join("pak01_dir.vpk")).unwrap(),
      b"vpk contents"
    );
    assert_eq!(
      std::fs::read(output_dir.join("nested").join("readme.txt")).unwrap(),
      b"read me"
    );
  }

  /// A name made only of plain components still escapes when a directory it sits under is a
  /// link, which is the one thing `relative_entry_path` cannot see.
  #[cfg(unix)]
  #[test]
  fn rejects_entries_resolving_through_a_symlinked_directory() {
    let workspace = tempfile::tempdir().unwrap();
    let output_dir = workspace.path().join("extracted");
    std::fs::create_dir_all(&output_dir).unwrap();
    std::os::unix::fs::symlink(workspace.path(), output_dir.join("escape")).unwrap();

    let result = ArchiveExtractor::new().sanitize_path("escape/evil.txt", &output_dir);

    assert!(
      matches!(result, Err(Error::UnauthorizedPath(_))),
      "expected an unauthorized path error, got {result:?}"
    );
  }
}
