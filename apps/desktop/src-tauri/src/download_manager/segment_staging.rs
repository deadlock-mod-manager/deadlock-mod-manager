//! On-disk state of a download split into segments, kept apart from the
//! single-stream `.partial` so neither format has to understand the other.
//!
//! ```text
//! <name>.segments/
//!   manifest.json   what the parts are and which are finished
//!   0.part … 3.part one append-only file per segment
//!   assembled       the joined file, only while it's being built
//! ```
//!
//! A part's length is how far its segment got. That prefix is provisional: the
//! range checks put it at the right offset, and the whole-file MD5, which every
//! segmented download has, decides whether its bytes are right. `complete` is
//! only recorded once a part is synced to disk at its full length.

use crate::errors::Error;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tokio::fs::File;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio_util::sync::CancellationToken;

pub const SEGMENT_COUNT: usize = 4;
const MANIFEST_VERSION: u32 = 1;
const MANIFEST: &str = "manifest.json";
const MANIFEST_TMP: &str = "manifest.json.tmp";
const ASSEMBLED: &str = "assembled";

/// Where a segment's bytes came from. Kept per segment so a later attempt never
/// adds bytes from one server to bytes from another.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SegmentSource {
  pub url: String,
  pub etag: String,
  pub last_modified: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Segment {
  pub start: u64,
  /// Exclusive.
  pub end: u64,
  pub complete: bool,
  pub source: Option<SegmentSource>,
}

impl Segment {
  pub fn byte_count(&self) -> u64 {
    self.end - self.start
  }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
  version: u32,
  size: u64,
  md5: String,
  segments: Vec<Segment>,
}

/// `size` bytes in [`SEGMENT_COUNT`] spans that cover it exactly.
pub fn plan_segments(size: u64) -> Vec<Segment> {
  let count = SEGMENT_COUNT as u128;
  let bound = |i: u128| (i * u128::from(size) / count) as u64;
  (0..count)
    .map(|i| Segment {
      start: bound(i),
      end: bound(i + 1),
      complete: false,
      source: None,
    })
    .collect()
}

pub fn staging_dir(target: &Path) -> PathBuf {
  let mut name = target.file_name().unwrap_or_default().to_owned();
  name.push(".segments");
  target.with_file_name(name)
}

/// Removes a file's segment staging; nothing there is not an error.
pub async fn discard_staging(target: &Path) -> Result<(), Error> {
  match tokio::fs::remove_dir_all(staging_dir(target)).await {
    Err(error) if error.kind() != std::io::ErrorKind::NotFound => Err(Error::Io(error)),
    _ => Ok(()),
  }
}

pub struct Staging {
  dir: PathBuf,
  manifest: Manifest,
  /// Bytes on disk per part.
  lengths: Vec<u64>,
}

impl Staging {
  /// Loads the staging for a file of `size` bytes and checksum `md5`, keeping
  /// only what can still be trusted and starting over when the manifest
  /// describes something else.
  pub async fn open(target: &Path, size: u64, md5: &str) -> Result<Self, Error> {
    let dir = staging_dir(target);
    let expected = Manifest {
      version: MANIFEST_VERSION,
      size,
      md5: md5.to_ascii_lowercase(),
      segments: plan_segments(size),
    };
    let manifest = match read_manifest(&dir).await {
      Some(stored) if Self::describes_same_file(&stored, &expected) => stored,
      stored => {
        if stored.is_some() || tokio::fs::try_exists(&dir).await.unwrap_or(false) {
          log::info!("Discarding segment staging that doesn't match {target:?}");
          discard_staging(target).await?;
        }
        expected
      }
    };
    tokio::fs::create_dir_all(&dir).await.map_err(Error::Io)?;

    let mut staging = Self {
      dir,
      manifest,
      lengths: vec![0; SEGMENT_COUNT],
    };
    // An assembly that didn't finish has consumed the parts it copied.
    let interrupted_assembly = tokio::fs::try_exists(staging.dir.join(ASSEMBLED))
      .await
      .unwrap_or(false);
    if interrupted_assembly {
      tokio::fs::remove_file(staging.dir.join(ASSEMBLED))
        .await
        .map_err(Error::Io)?;
    }
    for index in 0..SEGMENT_COUNT {
      let segment = &staging.manifest.segments[index];
      let length = tokio::fs::metadata(staging.part_path(index))
        .await
        .ok()
        .map(|metadata| metadata.len());
      let trusted = match length {
        None => !segment.complete && !interrupted_assembly,
        Some(length) if segment.complete => length == segment.byte_count(),
        Some(length) => length <= segment.byte_count(),
      };
      if trusted {
        staging.lengths[index] = length.unwrap_or(0);
      } else {
        staging.reset_segment(index).await?;
      }
    }
    staging.save().await?;
    Ok(staging)
  }

  fn describes_same_file(stored: &Manifest, expected: &Manifest) -> bool {
    stored.version == expected.version
      && stored.size == expected.size
      && stored.md5.eq_ignore_ascii_case(&expected.md5)
      && stored.segments.len() == expected.segments.len()
      && stored
        .segments
        .iter()
        .zip(&expected.segments)
        .all(|(stored, planned)| stored.start == planned.start && stored.end == planned.end)
  }

  pub fn part_path(&self, index: usize) -> PathBuf {
    self.dir.join(format!("{index}.part"))
  }

  pub fn segment(&self, index: usize) -> &Segment {
    &self.manifest.segments[index]
  }

  /// Bytes of segment `index` already on disk.
  pub fn stored(&self, index: usize) -> u64 {
    self.lengths[index]
  }

  pub fn stored_total(&self) -> u64 {
    self.lengths.iter().sum()
  }

  pub fn first_incomplete(&self) -> Option<usize> {
    (0..SEGMENT_COUNT).find(|&index| !self.manifest.segments[index].complete)
  }

  /// Ties every segment to `source`, first dropping bytes that came from
  /// anywhere else.
  pub async fn pin_source(&mut self, source: &SegmentSource) -> Result<(), Error> {
    for index in 0..SEGMENT_COUNT {
      let segment = &self.manifest.segments[index];
      let has_bytes = segment.complete || self.lengths[index] > 0;
      if has_bytes && segment.source.as_ref() != Some(source) {
        log::info!("Segment {index} came from another source; downloading it again");
        self.reset_segment(index).await?;
      }
      self.manifest.segments[index].source = Some(source.clone());
    }
    self.save().await
  }

  /// Records a finished segment. The caller has synced the part, so the record
  /// never claims bytes the disk doesn't hold.
  pub async fn mark_complete(&mut self, index: usize) -> Result<(), Error> {
    let length = tokio::fs::metadata(self.part_path(index))
      .await
      .map_err(Error::Io)?
      .len();
    if length != self.manifest.segments[index].byte_count() {
      return Err(Error::DownloadFailed(format!(
        "Segment {index} holds {length} of {} bytes",
        self.manifest.segments[index].byte_count()
      )));
    }
    self.lengths[index] = length;
    self.manifest.segments[index].complete = true;
    self.save().await
  }

  /// Empties a segment so it's downloaded from its first byte.
  pub async fn restart_segment(&mut self, index: usize) -> Result<(), Error> {
    self.reset_segment(index).await?;
    self.save().await
  }

  async fn reset_segment(&mut self, index: usize) -> Result<(), Error> {
    match tokio::fs::remove_file(self.part_path(index)).await {
      Err(error) if error.kind() != std::io::ErrorKind::NotFound => return Err(Error::Io(error)),
      _ => {}
    }
    self.lengths[index] = 0;
    let segment = &mut self.manifest.segments[index];
    segment.complete = false;
    segment.source = None;
    Ok(())
  }

  /// Written to a temporary file and synced before it replaces the manifest,
  /// so a crash leaves the old manifest or the new one, never half of one.
  async fn save(&self) -> Result<(), Error> {
    let data = serde_json::to_vec(&self.manifest).map_err(|error| {
      Error::FileWriteFailed(format!("Failed to encode segment manifest: {error}"))
    })?;
    let tmp = self.dir.join(MANIFEST_TMP);
    let mut file = File::create(&tmp).await.map_err(Error::Io)?;
    file.write_all(&data).await.map_err(Error::Io)?;
    file.sync_all().await.map_err(Error::Io)?;
    drop(file);
    tokio::fs::rename(&tmp, self.dir.join(MANIFEST))
      .await
      .map_err(Error::Io)
  }

  /// Joins the finished parts into one file, deleting each part once it's
  /// copied so the download never needs twice its size on disk.
  pub async fn assemble(&mut self, cancel_token: &CancellationToken) -> Result<PathBuf, Error> {
    let assembled_path = self.dir.join(ASSEMBLED);
    let mut assembled = File::create(&assembled_path).await.map_err(Error::Io)?;
    let mut buffer = vec![0_u8; 64 * 1024];
    for index in 0..SEGMENT_COUNT {
      let expected = self.manifest.segments[index].byte_count();
      if !self.manifest.segments[index].complete {
        return Err(Error::DownloadFailed(format!(
          "Segment {index} is not finished"
        )));
      }
      let mut part = File::open(self.part_path(index)).await.map_err(Error::Io)?;
      let mut copied: u64 = 0;
      loop {
        if cancel_token.is_cancelled() {
          return Err(Error::DownloadCancelled);
        }
        let read = part.read(&mut buffer).await.map_err(Error::Io)?;
        if read == 0 {
          break;
        }
        copied += read as u64;
        if copied > expected {
          break;
        }
        assembled
          .write_all(&buffer[..read])
          .await
          .map_err(|error| {
            Error::FileWriteFailed(format!("Failed to assemble download: {error}"))
          })?;
      }
      if copied != expected {
        return Err(Error::DownloadFailed(format!(
          "Segment {index} held {copied} bytes, expected {expected}"
        )));
      }
      drop(part);
      tokio::fs::remove_file(self.part_path(index))
        .await
        .map_err(Error::Io)?;
      self.lengths[index] = 0;
    }
    assembled.flush().await.map_err(Error::Io)?;
    assembled.sync_all().await.map_err(Error::Io)?;
    Ok(assembled_path)
  }
}

async fn read_manifest(dir: &Path) -> Option<Manifest> {
  let bytes = tokio::fs::read(dir.join(MANIFEST)).await.ok()?;
  serde_json::from_slice(&bytes).ok()
}

#[cfg(test)]
mod tests {
  use super::*;

  const MD5: &str = "0123456789abcdef0123456789abcdef";

  fn source(etag: &str) -> SegmentSource {
    SegmentSource {
      url: "https://filecache31.gamebanana.com/mods/mod.zip".to_string(),
      etag: etag.to_string(),
      last_modified: None,
    }
  }

  async fn write_part(staging: &Staging, index: usize, bytes: usize) {
    tokio::fs::write(staging.part_path(index), vec![7_u8; bytes])
      .await
      .unwrap();
  }

  #[test]
  fn segments_cover_the_file_exactly() {
    for size in [4, 7, 8 * 1024 * 1024, 123_861_688, u64::MAX] {
      let segments = plan_segments(size);
      assert_eq!(segments.len(), SEGMENT_COUNT);
      assert_eq!(segments[0].start, 0);
      assert_eq!(segments[SEGMENT_COUNT - 1].end, size);
      for pair in segments.windows(2) {
        assert_eq!(pair[0].end, pair[1].start, "gap or overlap at {size}");
      }
      let lengths: Vec<u64> = segments.iter().map(Segment::byte_count).collect();
      assert!(
        lengths.iter().max().unwrap() - lengths.iter().min().unwrap() <= 1,
        "{lengths:?}"
      );
    }
  }

  #[tokio::test]
  async fn a_reopened_staging_keeps_finished_and_partial_segments() {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("mod.zip");
    let mut staging = Staging::open(&target, 400, MD5).await.unwrap();
    staging.pin_source(&source("\"v1\"")).await.unwrap();
    write_part(&staging, 0, 100).await;
    staging.mark_complete(0).await.unwrap();
    write_part(&staging, 2, 40).await;

    let reopened = Staging::open(&target, 400, &MD5.to_ascii_uppercase())
      .await
      .unwrap();

    assert!(reopened.segment(0).complete);
    assert_eq!(reopened.stored(0), 100);
    assert_eq!(reopened.stored(2), 40);
    assert_eq!(reopened.stored_total(), 140);
    assert_eq!(reopened.first_incomplete(), Some(1));
    assert_eq!(reopened.segment(2).source, Some(source("\"v1\"")));
  }

  #[tokio::test]
  async fn staging_for_another_file_or_format_is_discarded() {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("mod.zip");
    for (size, md5) in [(401, MD5), (400, "ffffffffffffffffffffffffffffffff")] {
      let staging = Staging::open(&target, 400, MD5).await.unwrap();
      write_part(&staging, 1, 50).await;
      let reopened = Staging::open(&target, size, md5).await.unwrap();
      assert_eq!(
        reopened.stored_total(),
        0,
        "parts of a {size}-byte file with checksum {md5} were reused for another file"
      );
    }

    let manifest = staging_dir(&target).join(MANIFEST);
    for stored in [
      r#"{"version":2,"size":400,"md5":"0123456789abcdef0123456789abcdef","segments":[]}"#
        .to_string(),
      "{\"version\":1,\"size\":4".to_string(),
      serde_json::to_string(&Manifest {
        version: MANIFEST_VERSION,
        size: 400,
        md5: MD5.to_string(),
        // Spans that don't tile the file.
        segments: plan_segments(400)
          .into_iter()
          .map(|segment| Segment {
            end: segment.end - 1,
            ..segment
          })
          .collect(),
      })
      .unwrap(),
    ] {
      let staging = Staging::open(&target, 400, MD5).await.unwrap();
      write_part(&staging, 1, 50).await;
      tokio::fs::write(&manifest, &stored).await.unwrap();
      let reopened = Staging::open(&target, 400, MD5).await.unwrap();
      assert_eq!(reopened.stored_total(), 0, "trusted parts under {stored}");
    }
  }

  #[tokio::test]
  async fn parts_that_disagree_with_the_manifest_start_over() {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("mod.zip");
    let mut staging = Staging::open(&target, 400, MD5).await.unwrap();
    for index in 0..2 {
      write_part(&staging, index, 100).await;
      staging.mark_complete(index).await.unwrap();
    }
    // Finished but cut short, and longer than its segment.
    write_part(&staging, 0, 99).await;
    write_part(&staging, 2, 101).await;
    write_part(&staging, 3, 30).await;

    let reopened = Staging::open(&target, 400, MD5).await.unwrap();

    assert!(!reopened.segment(0).complete);
    assert_eq!(reopened.stored(0), 0, "a finished segment missing a byte");
    assert!(reopened.segment(1).complete);
    assert_eq!(reopened.stored(2), 0, "a part longer than its segment");
    assert_eq!(reopened.stored(3), 30);
    assert!(!reopened.part_path(0).exists() && !reopened.part_path(2).exists());
  }

  #[tokio::test]
  async fn finishing_a_segment_needs_all_of_its_bytes_on_disk() {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("mod.zip");
    let mut staging = Staging::open(&target, 400, MD5).await.unwrap();
    write_part(&staging, 1, 60).await;

    assert!(staging.mark_complete(1).await.is_err());
    assert!(!staging.segment(1).complete);
  }

  #[tokio::test]
  async fn bytes_from_another_source_are_dropped_before_new_ones_arrive() {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("mod.zip");
    let mut staging = Staging::open(&target, 400, MD5).await.unwrap();
    staging.pin_source(&source("\"v1\"")).await.unwrap();
    write_part(&staging, 0, 100).await;
    staging.mark_complete(0).await.unwrap();
    write_part(&staging, 1, 20).await;
    let mut staging = Staging::open(&target, 400, MD5).await.unwrap();
    assert_eq!(staging.stored_total(), 120);

    let mut moved = source("\"v1\"");
    moved.url = "https://filecache43.gamebanana.com/mods/mod.zip".to_string();
    staging.pin_source(&moved).await.unwrap();

    assert_eq!(
      staging.stored_total(),
      0,
      "bytes from filecache31 would be joined with bytes from filecache43"
    );
    assert!(!staging.segment(0).complete);
    assert_eq!(staging.segment(3).source, Some(moved));
  }

  #[tokio::test]
  async fn assembly_joins_parts_in_order_and_consumes_them() {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("mod.zip");
    let body: Vec<u8> = (0..=255).collect();
    let mut staging = Staging::open(&target, 256, MD5).await.unwrap();
    for index in 0..SEGMENT_COUNT {
      let segment = staging.segment(index).clone();
      tokio::fs::write(
        staging.part_path(index),
        &body[segment.start as usize..segment.end as usize],
      )
      .await
      .unwrap();
      staging.mark_complete(index).await.unwrap();
    }

    let assembled = staging.assemble(&CancellationToken::new()).await.unwrap();

    assert_eq!(tokio::fs::read(&assembled).await.unwrap(), body);
    assert!((0..SEGMENT_COUNT).all(|index| !staging.part_path(index).exists()));
  }

  #[tokio::test]
  async fn an_interrupted_assembly_downloads_the_consumed_parts_again() {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("mod.zip");
    let mut staging = Staging::open(&target, 400, MD5).await.unwrap();
    for index in 0..SEGMENT_COUNT {
      write_part(&staging, index, 100).await;
      staging.mark_complete(index).await.unwrap();
    }
    // The crash came after parts 0 and 1 were copied.
    let dir_path = staging_dir(&target);
    tokio::fs::write(dir_path.join(ASSEMBLED), vec![7_u8; 200])
      .await
      .unwrap();
    tokio::fs::remove_file(staging.part_path(0)).await.unwrap();
    tokio::fs::remove_file(staging.part_path(1)).await.unwrap();

    let reopened = Staging::open(&target, 400, MD5).await.unwrap();

    assert!(!dir_path.join(ASSEMBLED).exists());
    assert_eq!(reopened.first_incomplete(), Some(0));
    assert!(!reopened.segment(1).complete);
    assert!(reopened.segment(2).complete && reopened.segment(3).complete);
  }
}
