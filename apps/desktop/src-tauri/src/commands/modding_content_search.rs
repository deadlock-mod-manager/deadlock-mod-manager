use super::modding_archive::ModdingArchiveEntry;
use crate::errors::Error;
use regex::{Regex, RegexBuilder};
use serde::{Deserialize, Serialize};
use source2_model::vpk_extract::VpkArchive;
use std::io::Write;
use std::time::{Duration, Instant};
use ts_rs::TS;
use vpkmanager::source2::kv3::{self, Value};

#[path = "modding_content_text.rs"]
mod text;

const MAX_TEXT: usize = 16 * 1024 * 1024;
const MAX_FILE: usize = 4 * 1024 * 1024;
const MAX_PAGE_BYTES: usize = 32 * 1024 * 1024;
const MAX_PAGE_FILES: usize = 2048;
const MAX_PAGE_RESULTS: usize = 200;
const MAX_FILE_SNIPPETS: usize = 3;

#[derive(Clone, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ModdingContentSearchRequest {
  pub directory: String,
  pub query: String,
  pub regex: bool,
  pub case_sensitive: bool,
  pub path_filter: String,
  pub cursor: usize,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ModdingContentMatch {
  pub line: usize,
  pub column: usize,
  pub end_column: usize,
  pub snippet: String,
  pub match_start: usize,
  pub match_end: usize,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ModdingContentSearchFile {
  pub entry: ModdingArchiveEntry,
  pub matches: Vec<ModdingContentMatch>,
  pub matching_lines: usize,
  pub decoded: bool,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ModdingContentSearchPage {
  pub files: Vec<ModdingContentSearchFile>,
  pub scanned_files: usize,
  pub skipped_files: usize,
  pub next_cursor: Option<usize>,
  pub diagnostics: Vec<String>,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ModdingArchiveText {
  pub text: String,
  pub decoded: bool,
}

fn supported(path: &str) -> bool {
  let extension = path.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
  [
    "txt",
    "json",
    "xml",
    "cfg",
    "kv3",
    "lst",
    "lua",
    "nut",
    "js",
    "ts",
    "csv",
    "ini",
    "vdf",
    "vmt",
    "vtex",
    "vmat",
    "vmdl",
    "vpcf",
    "vdata",
    "vsndevts",
    "vmat_c",
    "vpcf_c",
    "vdata_c",
    "vmdl_c",
    "vmesh_c",
    "vanim_c",
    "vnmgraph_c",
    "vnmclip_c",
    "vsndevts_c",
    "vcompmat_c",
    "vpost_c",
    "vseq_c",
  ]
  .contains(&extension.as_str())
}

struct TextBuffer(Vec<u8>);
impl std::io::Write for TextBuffer {
  fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
    if self.0.len() + bytes.len() > MAX_TEXT {
      return Err(std::io::Error::other("Decoded text exceeds 16 MB"));
    }
    self.0.extend_from_slice(bytes);
    Ok(bytes.len())
  }
  fn flush(&mut self) -> std::io::Result<()> {
    Ok(())
  }
}

pub(super) fn decode(path: &str, bytes: Vec<u8>) -> Result<ModdingArchiveText, Error> {
  let decoded = path.to_ascii_lowercase().ends_with("_c");
  let text = if decoded {
    let resource = vpkmanager::source2::resource::Resource::parse(&bytes)
      .map_err(|error| Error::InvalidInput(error.to_string()))?;
    let mut buffer = TextBuffer(Vec::new());
    writeln!(buffer, "{{")?;
    let mut fields = 0;
    for (kind, name) in [(*b"DATA", "DATA"), (*b"MDAT", "MDAT")] {
      if let Some(data) = resource.find_block(kind)
        && let Ok((value, encoding)) = kv3::decode_preserving(data)
      {
        text::field(&mut buffer, name, &value, Some(&encoding), 1)
          .map_err(|error| Error::InvalidInput(error.to_string()))?;
        fields += 1;
      }
    }
    if let Some(data) = resource.find_block(*b"RERL")
      && let Ok(references) = super::modding_dependencies::references(data)
    {
      let value = Value::Array(references.into_iter().map(Value::String).collect());
      text::field(&mut buffer, "RERL", &value, None, 1)
        .map_err(|error| Error::InvalidInput(error.to_string()))?;
      fields += 1;
    }
    if fields == 0 {
      return Err(Error::InvalidInput(
        "This compiled resource has no supported searchable fields".into(),
      ));
    }
    write!(buffer, "}}")?;
    String::from_utf8(buffer.0).map_err(|error| Error::InvalidInput(error.to_string()))?
  } else {
    super::modding_preview::text_preview(&bytes)?
  };
  Ok(ModdingArchiveText { text, decoded })
}

fn expression(request: &ModdingContentSearchRequest) -> Result<Regex, Error> {
  super::modding_workspace::relative(&request.directory, true)?;
  if request.query.is_empty() || request.query.len() > 4096 || request.path_filter.len() > 1024 {
    return Err(Error::InvalidInput(
      "Enter a content query up to 4096 characters and a path filter up to 1024 characters".into(),
    ));
  }
  let pattern = if request.regex {
    request.query.clone()
  } else {
    text::literal_pattern(&request.query)
  };
  RegexBuilder::new(&pattern)
    .case_insensitive(!request.case_sensitive)
    .size_limit(1024 * 1024)
    .nest_limit(64)
    .build()
    .map_err(|error| Error::InvalidInput(format!("Invalid regular expression: {error}")))
}

fn matches(text: &str, expression: &Regex) -> (Vec<ModdingContentMatch>, usize) {
  let mut matches = Vec::new();
  let mut count = 0;
  for (line_index, line) in text.lines().enumerate() {
    let Some(found) = expression.find(line) else {
      continue;
    };
    count += 1;
    if matches.len() == MAX_FILE_SNIPPETS {
      continue;
    }
    let start = line[..found.start()]
      .char_indices()
      .rev()
      .nth(80)
      .map_or(0, |(index, _)| index);
    let end = line[found.start()..]
      .char_indices()
      .nth(240)
      .map_or(line.len(), |(index, _)| found.start() + index);
    matches.push(ModdingContentMatch {
      line: line_index + 1,
      column: line[..found.start()].encode_utf16().count(),
      end_column: line[..found.end()].encode_utf16().count(),
      snippet: line[start..end].to_owned(),
      match_start: line[start..found.start()].encode_utf16().count(),
      match_end: line[start..found.end().min(end)].encode_utf16().count(),
    });
  }
  (matches, count)
}

fn search(
  archive: &VpkArchive,
  request: &ModdingContentSearchRequest,
) -> Result<ModdingContentSearchPage, Error> {
  let expression = expression(request)?;
  let prefix = if request.directory.is_empty() {
    String::new()
  } else {
    format!("{}/", request.directory)
  };
  let filter = request.path_filter.to_lowercase();
  let mut entries: Vec<_> = archive
    .entries_with_sizes()
    .filter(|(path, _)| path.starts_with(&prefix) && path.to_lowercase().contains(&filter))
    .collect();
  entries.sort_unstable_by_key(|(path, _)| {
    let priority = match path.rsplit('.').next().unwrap_or("") {
      "vdata" | "vdata_c" | "vsndevts" | "vsndevts_c" => 0,
      "vmdl_c" | "vmesh_c" | "vanim_c" | "vnmgraph_c" | "vnmclip_c" => 2,
      _ => 1,
    };
    (priority, *path)
  });
  let started = Instant::now();
  let mut bytes = 0;
  let mut result = ModdingContentSearchPage {
    files: Vec::new(),
    scanned_files: 0,
    skipped_files: 0,
    next_cursor: None,
    diagnostics: Vec::new(),
  };
  for (index, (path, size)) in entries.iter().enumerate().skip(request.cursor) {
    if result.scanned_files >= MAX_PAGE_FILES
      || result.files.len() >= MAX_PAGE_RESULTS
      || bytes >= MAX_PAGE_BYTES
      || started.elapsed() >= Duration::from_secs(5)
    {
      result.next_cursor = Some(index);
      break;
    }
    if !supported(path) || *size > MAX_FILE as u64 {
      result.skipped_files += 1;
      continue;
    }
    result.scanned_files += 1;
    let document = archive
      .extract_entry_limited(path, MAX_FILE)
      .map_err(|error| Error::InvalidInput(error.to_string()))
      .and_then(|data| {
        bytes += data.len();
        decode(path, data)
      });
    match document {
      Ok(document) => {
        bytes += document.text.len();
        let (matches, matching_lines) = matches(&document.text, &expression);
        if matching_lines > 0 {
          result.files.push(ModdingContentSearchFile {
            entry: ModdingArchiveEntry {
              path: (*path).into(),
              name: path.rsplit('/').next().unwrap_or(path).into(),
              directory: false,
              size: *size,
              file_count: 1,
            },
            matches,
            matching_lines,
            decoded: document.decoded,
          });
        }
      }
      Err(error) => {
        result.skipped_files += 1;
        if result.diagnostics.len() < 5 {
          result.diagnostics.push(format!("{path}: {error}"));
        }
      }
    }
  }
  Ok(result)
}

#[tauri::command]
pub async fn search_modding_archive_contents(
  archive_path: String,
  request: ModdingContentSearchRequest,
) -> Result<ModdingContentSearchPage, Error> {
  expression(&request)?;
  let path = super::modding_archive::archive_path(Some(archive_path))?;
  tauri::async_runtime::spawn_blocking(move || {
    let archive = super::foundry::open_archive(&path, None)?;
    search(&archive, &request)
  })
  .await
  .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}

#[cfg(test)]
#[path = "modding_content_search_tests.rs"]
mod tests;

#[tauri::command]
pub async fn read_modding_archive_text(
  archive_path: String,
  path: String,
) -> Result<ModdingArchiveText, Error> {
  super::modding_workspace::relative(&path, false)?;
  if !supported(&path) {
    return Err(Error::InvalidInput(
      "This file type is not supported by content search".into(),
    ));
  }
  let archive = super::modding_archive::archive_path(Some(archive_path))?;
  tauri::async_runtime::spawn_blocking(move || {
    let archive = super::foundry::open_archive(&archive, None)?;
    let bytes = archive
      .extract_entry_limited(&path, MAX_FILE)
      .map_err(|error| Error::InvalidInput(error.to_string()))?;
    decode(&path, bytes)
  })
  .await
  .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}
