//! Cache decoded metadata, not pixels. Every hit still verifies the on-disk frame hashes.
use super::{Error, MAX_BYTES, ModdingModelImage};
use std::{
  collections::VecDeque,
  io::Read,
  path::{Path, PathBuf},
  sync::{Mutex, OnceLock},
};

struct Entry {
  directory: PathBuf,
  image: ModdingModelImage,
  hashes: Vec<String>,
}
static CACHE: OnceLock<Mutex<VecDeque<Entry>>> = OnceLock::new();

pub(super) fn get(directory: &Path) -> Result<Option<ModdingModelImage>, Error> {
  let found = CACHE
    .get_or_init(Mutex::default)
    .lock()
    .expect("image cache lock")
    .iter()
    .find(|entry| entry.directory == directory)
    .map(|entry| (entry.image.clone(), entry.hashes.clone()));
  let Some((image, hashes)) = found else {
    return Ok(None);
  };
  let original = directory.join(
    Path::new(&image.path)
      .file_name()
      .expect("managed original name"),
  );
  let file = match std::fs::File::open(original) {
    Ok(file) => file,
    Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
    Err(error) => return Err(error.into()),
  };
  let mut bytes = Vec::new();
  file.take(MAX_BYTES + 1).read_to_end(&mut bytes)?;
  if bytes.len() as u64 > MAX_BYTES
    || directory.file_name().and_then(|name| name.to_str())
      != Some(&super::super::modding_edits::fingerprint(&bytes))
  {
    return Ok(None);
  }
  drop(bytes);
  for (frame, hash) in image.frames.iter().zip(hashes) {
    let path = directory.join(
      Path::new(&frame.path)
        .file_name()
        .expect("managed frame name"),
    );
    let file = match std::fs::File::open(path) {
      Ok(file) => file,
      Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
      Err(error) => return Err(error.into()),
    };
    let mut bytes = Vec::new();
    file.take(MAX_BYTES + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_BYTES || super::super::modding_edits::fingerprint(&bytes) != hash {
      return Ok(None);
    }
  }
  Ok(Some(image))
}

pub(super) fn insert(directory: PathBuf, image: ModdingModelImage, hashes: Vec<String>) {
  let mut entries = CACHE
    .get_or_init(Mutex::default)
    .lock()
    .expect("image cache lock");
  entries.retain(|entry| entry.directory != directory);
  if entries.len() >= 64 {
    entries.pop_front();
  }
  entries.push_back(Entry {
    directory,
    image,
    hashes,
  });
}
