use crate::app_runtime::AppHandle;
use crate::errors::Error;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Emitter;
use tokio::task;
use vpk_parser::{VpkParseOptions, VpkParsed, VpkParser};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAddonInfo {
  pub file_path: String,
  pub file_name: String,
  pub vpk_parsed: VpkParsed,
  pub remote_id: Option<String>, // Will be populated by API call
  pub match_info: Option<MatchInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchInfo {
  pub certainty: u8,
  pub match_type: String,
  pub mod_name: Option<String>,
  pub mod_author: Option<String>,
  pub alternative_matches: Option<Vec<AlternativeMatch>>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub file_id: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub source_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlternativeMatch {
  pub id: String,
  pub mod_name: String,
  pub mod_author: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct HashAnalysisRequest {
  #[serde(skip_serializing_if = "Option::is_none")]
  sha256: Option<String>,
  #[serde(rename = "contentSignature")]
  content_signature: String,
  #[serde(skip_serializing_if = "Option::is_none", rename = "fastHash")]
  fast_hash: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none", rename = "fileSize")]
  file_size: Option<u64>,
  #[serde(skip_serializing_if = "Option::is_none", rename = "merkleRoot")]
  merkle_root: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApiMatchedVpk {
  id: String,
  submission_type: Option<String>,
  submission_id: Option<String>,
  file_id: Option<String>,
  source_path: Option<String>,
  /// Catalog relation the API only attaches for older clients; it goes away
  /// with the catalog retirement, so it is used for display names only.
  #[serde(rename = "mod")]
  mod_info: Option<ApiModInfo>,
}

impl ApiMatchedVpk {
  /// GameBanana slug (`123` or `snd-123`) used as the mod's remote ID.
  fn remote_id(&self) -> Option<String> {
    match (
      self.submission_type.as_deref(),
      self.submission_id.as_deref(),
    ) {
      (Some("sound"), Some(id)) => Some(format!("snd-{id}")),
      (Some(_), Some(id)) => Some(id.to_string()),
      _ => self.mod_info.as_ref().map(|m| m.remote_id.clone()),
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ApiModInfo {
  id: String,
  #[serde(rename = "remoteId")]
  remote_id: String,
  name: String,
  author: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ApiMatch {
  certainty: u8,
  #[serde(rename = "matchType")]
  match_type: String,
  #[serde(skip_serializing_if = "Option::is_none", rename = "alternativeMatches")]
  alternative_matches: Option<Vec<ApiMatchedVpk>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct HashAnalysisResponse {
  #[serde(rename = "matchedVpk")]
  matched_vpk: ApiMatchedVpk,
  #[serde(rename = "match")]
  match_info: ApiMatch,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeAddonsResult {
  pub addons: Vec<LocalAddonInfo>,
  pub total_count: usize,
  pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddonAnalysisProgress {
  pub step: String,
  pub step_description: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub files_found: Option<usize>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub current_file: Option<usize>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub current_file_name: Option<String>,
  pub total_progress: u8,
}

pub struct AddonAnalyzer;

const LOOKUP_CONNECT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(10);
const LOOKUP_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);

impl AddonAnalyzer {
  pub fn new() -> Self {
    Self
  }

  /// Emit progress event to frontend
  #[allow(clippy::too_many_arguments)]
  fn emit_progress(
    &self,
    app_handle: &Option<AppHandle>,
    step: &str,
    step_description: &str,
    files_found: Option<usize>,
    current_file: Option<usize>,
    current_file_name: Option<String>,
    total_progress: u8,
  ) {
    if let Some(handle) = app_handle {
      let progress = AddonAnalysisProgress {
        step: step.to_string(),
        step_description: step_description.to_string(),
        files_found,
        current_file,
        current_file_name,
        total_progress,
      };

      if let Err(e) = handle.emit("addon-analysis-progress", &progress) {
        log::warn!("Failed to emit progress event: {e}");
      }
    }
  }

  /// Client for identification lookups. Each request gets a finite timeout so
  /// an unreachable service fails the lookup instead of stalling the analysis.
  fn lookup_client() -> Result<reqwest::Client, Error> {
    crate::proxy::build_http_client(|builder| {
      builder
        .connect_timeout(LOOKUP_CONNECT_TIMEOUT)
        .timeout(LOOKUP_TIMEOUT)
    })
  }

  /// Ask the hash analysis API which mod a VPK belongs to. `Ok(None)` means the
  /// service answered and found no match; a failed request is an error.
  async fn analyze_hashes(
    client: &reqwest::Client,
    vpk_parsed: &VpkParsed,
  ) -> Result<Option<(String, MatchInfo)>, Error> {
    let api_url = crate::commands::state::get_api_url();
    Self::lookup_hashes(
      client,
      &format!("{api_url}/api/v2/vpk-analyse-hashes"),
      vpk_parsed,
    )
    .await
  }

  async fn lookup_hashes(
    client: &reqwest::Client,
    endpoint: &str,
    vpk_parsed: &VpkParsed,
  ) -> Result<Option<(String, MatchInfo)>, Error> {
    let request = HashAnalysisRequest {
      sha256: Some(vpk_parsed.fingerprint.sha256.clone()),
      content_signature: vpk_parsed.fingerprint.content_signature.clone(),
      fast_hash: Some(vpk_parsed.fingerprint.fast_hash.clone()),
      file_size: Some(vpk_parsed.fingerprint.file_size as u64),
      merkle_root: vpk_parsed.fingerprint.merkle_root.clone(),
    };

    log::debug!(
      "Calling hash analysis API for file: {} with hashes: sha256={:?}, contentSig={}, fastHash={:?}",
      vpk_parsed.fingerprint.file_path,
      request.sha256,
      request.content_signature,
      request.fast_hash
    );

    let response = client
      .post(endpoint)
      .json(&request)
      .send()
      .await
      .map_err(|e| Error::Network(format!("Could not reach the identification service: {e}")))?;
    let status = response.status();
    if !status.is_success() {
      return Err(Error::Network(format!(
        "The identification service returned {status}"
      )));
    }
    let results = response
      .json::<Vec<HashAnalysisResponse>>()
      .await
      .map_err(|e| {
        Error::Network(format!(
          "The identification service sent a response that could not be read: {e}"
        ))
      })?;

    let Some(result) = results.first() else {
      return Ok(None);
    };
    let Some(remote_id) = result.matched_vpk.remote_id() else {
      return Ok(None);
    };
    let alternative_matches = result
      .match_info
      .alternative_matches
      .as_ref()
      .map(|matches| {
        matches
          .iter()
          .map(|m| AlternativeMatch {
            id: m.id.clone(),
            mod_name: m.mod_info.as_ref().map_or_else(
              || m.remote_id().unwrap_or_default(),
              |info| info.name.clone(),
            ),
            mod_author: m
              .mod_info
              .as_ref()
              .map(|info| info.author.clone())
              .unwrap_or_default(),
          })
          .collect()
      });

    let mod_info = result.matched_vpk.mod_info.as_ref();
    let mod_name = mod_info.map_or_else(|| remote_id.clone(), |info| info.name.clone());
    Ok(Some((
      remote_id,
      MatchInfo {
        certainty: result.match_info.certainty,
        match_type: result.match_info.match_type.clone(),
        mod_name: Some(mod_name),
        mod_author: mod_info.map(|info| info.author.clone()),
        alternative_matches,
        file_id: result.matched_vpk.file_id.clone(),
        source_path: result.matched_vpk.source_path.clone(),
      },
    )))
  }

  /// Analyze all VPK files in the local addons directory
  pub async fn analyze_local_addons(
    &self,
    game_path: PathBuf,
    profile_folder: Option<String>,
    app_handle: Option<AppHandle>,
  ) -> Result<AnalyzeAddonsResult, Error> {
    log::info!(
      "Starting fast parallel analysis of local addons for profile: {:?}",
      profile_folder
    );

    // Emit scanning progress
    self.emit_progress(
      &app_handle,
      "scanning",
      "Scanning addons directory for VPK files...",
      None,
      None,
      None,
      5,
    );

    let addons_path = if let Some(ref folder) = profile_folder {
      game_path
        .join("game")
        .join("citadel")
        .join("addons")
        .join(folder)
    } else {
      game_path.join("game").join("citadel").join("addons")
    };

    if !addons_path.exists() {
      log::warn!("Addons folder does not exist: {:?}", addons_path);
      return Ok(AnalyzeAddonsResult {
        addons: Vec::new(),
        total_count: 0,
        errors: vec!["Addons folder not found. Make sure the game is set up for mods.".to_string()],
      });
    }

    let profile_base = crate::mod_manager::shard::ProfileBase::new(&addons_path)?;
    let mut vpk_file_paths = Vec::new();
    for (shard_index, shard_path) in profile_base.existing_shards() {
      // The game only loads VPKs at the top of each search path; subfolders
      // hold internal staging from interrupted operations.
      if let Err(e) = Self::find_vpk_file_paths_shallow(&shard_path, &mut vpk_file_paths) {
        return Ok(AnalyzeAddonsResult {
          addons: Vec::new(),
          total_count: 0,
          errors: vec![format!("Failed to scan addon shard {shard_index}: {e}")],
        });
      }
    }

    // Separate prefixed VPKs from non-prefixed ones
    let mut prefixed_vpk_paths = Vec::new();
    let mut non_prefixed_vpk_paths = Vec::new();

    for vpk_path in vpk_file_paths {
      if let Some(file_name) = vpk_path.file_name().and_then(|n| n.to_str()) {
        if Self::extract_mod_id_from_filename(file_name).is_some() {
          prefixed_vpk_paths.push(vpk_path);
        } else {
          non_prefixed_vpk_paths.push(vpk_path);
        }
      }
    }

    if !prefixed_vpk_paths.is_empty() {
      log::info!(
        "Found {} prefixed VPKs (will skip hash analysis) and {} non-prefixed VPKs (will analyze fully)",
        prefixed_vpk_paths.len(),
        non_prefixed_vpk_paths.len()
      );
    }

    log::info!(
      "Found {} VPK files total, starting parallel analysis",
      prefixed_vpk_paths.len() + non_prefixed_vpk_paths.len()
    );

    let total_files = prefixed_vpk_paths.len() + non_prefixed_vpk_paths.len();

    // Emit files found progress
    self.emit_progress(
      &app_handle,
      "parsing",
      "Parsing VPK files...",
      Some(total_files),
      None,
      None,
      15,
    );

    // Process files in parallel batches to avoid overwhelming the system
    let batch_size = 4; // Process 4 files at a time
    let mut addons = Vec::new();
    let mut errors = Vec::new();
    let mut processed_files = 0;

    // First, process prefixed VPKs (parse only, no hash analysis needed)
    for batch in prefixed_vpk_paths.chunks(batch_size) {
      let mut handles = Vec::new();

      for file_path in batch {
        let file_path = file_path.clone();
        let handle = task::spawn_blocking(move || Self::parse_vpk_file_fast(&file_path));
        handles.push(handle);
      }

      // Wait for all tasks in this batch to complete
      for handle in handles {
        processed_files += 1;
        let progress = 15 + ((processed_files as f32 / total_files as f32) * 35.0) as u8;

        match handle.await {
          Ok(Ok(mut addon_info)) => {
            // Extract mod ID from the prefixed filename
            if let Some(mod_id) = Self::extract_mod_id_from_filename(&addon_info.file_name) {
              // Mark this as already identified by prefix (no hash analysis needed)
              addon_info.remote_id = Some(mod_id);
            }

            self.emit_progress(
              &app_handle,
              "parsing",
              "Parsing VPK files...",
              Some(total_files),
              Some(processed_files),
              Some(addon_info.file_name.clone()),
              progress,
            );
            addons.push(addon_info);
          }
          Ok(Err(e)) => {
            errors.push(e);
            self.emit_progress(
              &app_handle,
              "parsing",
              "Parsing VPK files...",
              Some(total_files),
              Some(processed_files),
              None,
              progress,
            );
          }
          Err(e) => {
            errors.push(format!("Task failed: {e}"));
            self.emit_progress(
              &app_handle,
              "parsing",
              "Parsing VPK files...",
              Some(total_files),
              Some(processed_files),
              None,
              progress,
            );
          }
        }
      }
    }

    // Now process non-prefixed VPKs (full parsing)
    for batch in non_prefixed_vpk_paths.chunks(batch_size) {
      let mut handles = Vec::new();

      for file_path in batch {
        let file_path = file_path.clone();
        let handle = task::spawn_blocking(move || Self::parse_vpk_file_fast(&file_path));
        handles.push(handle);
      }

      // Wait for all tasks in this batch to complete
      for handle in handles {
        processed_files += 1;
        let progress = 15 + ((processed_files as f32 / total_files as f32) * 35.0) as u8; // 15-50%

        match handle.await {
          Ok(Ok(addon_info)) => {
            // Emit progress with current file info
            self.emit_progress(
              &app_handle,
              "parsing",
              "Parsing VPK files...",
              Some(total_files),
              Some(processed_files),
              Some(addon_info.file_name.clone()),
              progress,
            );
            addons.push(addon_info);
          }
          Ok(Err(e)) => {
            errors.push(e);
            // Still emit progress for failed files
            self.emit_progress(
              &app_handle,
              "parsing",
              "Parsing VPK files...",
              Some(total_files),
              Some(processed_files),
              None,
              progress,
            );
          }
          Err(e) => {
            errors.push(format!("Task failed: {e}"));
            // Still emit progress for failed files
            self.emit_progress(
              &app_handle,
              "parsing",
              "Parsing VPK files...",
              Some(total_files),
              Some(processed_files),
              None,
              progress,
            );
          }
        }
      }
    }

    log::info!(
      "Fast analysis complete: {} addons parsed, {} errors",
      addons.len(),
      errors.len()
    );

    // Separate prefixed addons (already have remote_id) from non-prefixed ones (need hash analysis)
    let mut prefixed_addons = Vec::new();
    let mut non_prefixed_addons = Vec::new();

    for addon in addons {
      if addon.remote_id.is_some() {
        prefixed_addons.push(addon);
      } else {
        non_prefixed_addons.push(addon);
      }
    }

    // Files that parsed, whether or not the lookup below can identify them.
    let parsed_count = prefixed_addons.len() + non_prefixed_addons.len();

    log::info!(
      "Skipping hash analysis for {} prefixed addons (already identified), analyzing {} non-prefixed addons",
      prefixed_addons.len(),
      non_prefixed_addons.len()
    );

    // Now perform hash analysis for non-prefixed addons only
    log::info!(
      "Starting hash analysis for {} non-prefixed addons",
      non_prefixed_addons.len()
    );

    // Emit hash analysis start progress
    self.emit_progress(
      &app_handle,
      "analyzing_hashes",
      "Identifying mods using hash analysis...",
      Some(non_prefixed_addons.len()),
      None,
      None,
      50,
    );

    let mut identified_addons = Vec::new();
    let total_addons = non_prefixed_addons.len();
    let client = Self::lookup_client();

    for (index, mut addon) in non_prefixed_addons.into_iter().enumerate() {
      let current_addon_num = index + 1;
      let progress = 50 + ((current_addon_num as f32 / total_addons as f32) * 45.0) as u8; // 50-95%

      // Emit progress for current addon being analyzed
      self.emit_progress(
        &app_handle,
        "analyzing_hashes",
        "Identifying mods using hash analysis...",
        Some(total_addons),
        Some(current_addon_num),
        Some(addon.file_name.clone()),
        progress,
      );

      let lookup = match &client {
        Ok(client) => Self::analyze_hashes(client, &addon.vpk_parsed)
          .await
          .map_err(|e| e.to_string()),
        Err(e) => Err(e.to_string()),
      };
      match lookup {
        Ok(Some((remote_id, match_info))) => {
          addon.remote_id = Some(remote_id.clone());
          addon.match_info = Some(match_info);
          log::debug!(
            "Identified addon: {} -> remote_id: {remote_id} (mod: {})",
            addon.file_name,
            addon
              .match_info
              .as_ref()
              .unwrap()
              .mod_name
              .as_ref()
              .unwrap_or(&"Unknown".to_string())
          );
        }
        Ok(None) => {
          log::debug!("No match found for addon: {}", addon.file_name);
        }
        Err(e) => {
          log::warn!("Failed to analyze hashes for {}: {e}", addon.file_name);
          errors.push(format!("Hash analysis failed for {}: {e}", addon.file_name));
          // A file that couldn't be checked isn't an unknown mod; it is
          // listed only as an error.
          continue;
        }
      }
      identified_addons.push(addon);
    }

    // Add prefixed addons to the results
    let prefixed_count = prefixed_addons.len();
    identified_addons.extend(prefixed_addons);

    log::info!(
      "Hash analysis complete: {} addons processed ({} prefixed, {} analyzed)",
      identified_addons.len(),
      prefixed_count,
      total_addons
    );

    // Emit completion progress
    self.emit_progress(
      &app_handle,
      "complete",
      "Analysis complete!",
      Some(parsed_count),
      Some(parsed_count),
      None,
      100,
    );

    Ok(AnalyzeAddonsResult {
      total_count: parsed_count,
      addons: identified_addons,
      errors,
    })
  }

  fn find_vpk_file_paths_shallow(dir: &PathBuf, vpk_paths: &mut Vec<PathBuf>) -> Result<(), Error> {
    if !dir.is_dir() {
      return Ok(());
    }
    for entry in std::fs::read_dir(dir)? {
      let path = entry?.path();
      if path.is_file() && path.extension().and_then(|extension| extension.to_str()) == Some("vpk")
      {
        vpk_paths.push(path);
      }
    }
    Ok(())
  }

  /// Check if a VPK filename has a mod ID prefix and extract it
  fn extract_mod_id_from_filename(filename: &str) -> Option<String> {
    use crate::mod_manager::vpk_manager::VpkManager;
    VpkManager::extract_mod_id_from_prefix(filename)
  }

  /// Identify one VPK through the hash analysis API, the same lookup the
  /// "Analyze local addons" action runs for every addon.
  pub async fn identify_file(
    &self,
    path: &std::path::Path,
  ) -> Result<Option<(String, MatchInfo)>, Error> {
    let owned = path.to_path_buf();
    let info = task::spawn_blocking(move || Self::parse_vpk_file_fast(&owned))
      .await
      .map_err(|e| Error::BackgroundTaskFailed(e.to_string()))?
      .map_err(Error::InvalidInput)?;
    Self::analyze_hashes(&Self::lookup_client()?, &info.vpk_parsed).await
  }

  /// Fast VPK parsing with minimal data extraction for identification
  fn parse_vpk_file_fast(file_path: &PathBuf) -> Result<LocalAddonInfo, String> {
    let file_name = file_path
      .file_name()
      .unwrap_or_default()
      .to_string_lossy()
      .to_string();

    let file_path_str = file_path.to_string_lossy().to_string();

    // Get file metadata first (fast operation)
    let metadata = std::fs::metadata(file_path)
      .map_err(|e| format!("Failed to get metadata for {}: {}", file_name, e))?;

    let last_modified = metadata
      .modified()
      .ok()
      .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
      .and_then(|duration| chrono::DateTime::from_timestamp(duration.as_secs() as i64, 0));

    // Only read the file if it's reasonably sized (avoid huge files)
    let file_size = metadata.len();
    if file_size > 500 * 1024 * 1024 {
      // Skip files larger than 500MB
      return Err(format!(
        "Skipping {}: file too large ({} MB)",
        file_name,
        file_size / 1024 / 1024
      ));
    }

    // Read the VPK file
    let vpk_data =
      std::fs::read(file_path).map_err(|e| format!("Failed to read {}: {}", file_name, e))?;

    // Use minimal parsing options for speed
    let options = VpkParseOptions {
      include_full_file_hash: false, // Skip expensive full file hash
      file_path: file_path_str.clone(),
      last_modified,
      include_merkle: false, // Skip merkle tree calculation for now
      include_entries: true, // Include entries for unidentified mod analysis
    };

    let parsed = VpkParser::parse(vpk_data, options)
      .map_err(|e| format!("Failed to parse {}: {}", file_name, e))?;

    Ok(LocalAddonInfo {
      file_path: file_path_str,
      file_name,
      vpk_parsed: parsed,
      remote_id: None,
      match_info: None,
    })
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn parse(json: &str) -> HashAnalysisResponse {
    serde_json::from_str::<Vec<HashAnalysisResponse>>(json)
      .expect("hash analysis response should deserialize")
      .remove(0)
  }

  #[test]
  fn reads_the_submission_identity_without_catalog_mod() {
    let result = parse(
      r#"[{"matchedVpk":{"id":"vpk_1","submissionType":"sound","submissionId":"42","fileId":"100","sourcePath":"files/base.vpk"},
          "match":{"certainty":100,"matchType":"sha256"}}]"#,
    );
    assert_eq!(result.matched_vpk.remote_id().as_deref(), Some("snd-42"));
    assert!(result.matched_vpk.mod_info.is_none());
    assert_eq!(result.matched_vpk.file_id.as_deref(), Some("100"));
    assert_eq!(
      result.matched_vpk.source_path.as_deref(),
      Some("files/base.vpk")
    );
  }

  #[test]
  fn falls_back_to_catalog_mod_for_rows_without_identity() {
    let result = parse(
      r#"[{"matchedVpk":{"id":"vpk_1","submissionType":null,"submissionId":null,
            "mod":{"id":"mod_1","remoteId":"123","name":"Mod","author":"Author"}},
          "match":{"certainty":90,"matchType":"contentSignature"}}]"#,
    );
    assert_eq!(result.matched_vpk.remote_id().as_deref(), Some("123"));
    assert!(result.matched_vpk.file_id.is_none());
  }

  fn parsed_vpk() -> VpkParsed {
    serde_json::from_value(serde_json::json!({
      "version": 2,
      "treeLength": 0,
      "fileDataSectionSize": null,
      "archiveMd5SectionSize": null,
      "otherMd5SectionSize": null,
      "signatureSectionSize": null,
      "entries": [],
      "manifestSha256": "manifest",
      "dirSha256": null,
      "fingerprint": {
        "filePath": "pak01_dir.vpk",
        "fileSize": 4,
        "lastModified": null,
        "fastHash": "fast",
        "sha256": "sha",
        "contentSignature": "signature",
        "vpkVersion": 2,
        "fileCount": 0,
        "hasMultiparts": false,
        "hasInlineData": false,
        "merkleRoot": null,
        "merkleLeaves": null
      }
    }))
    .unwrap()
  }

  /// Answers one request with `status` and `body` after `delay`, having read
  /// the whole request so the client never sees a reset.
  async fn serve_once(status: u16, body: &'static str, delay: std::time::Duration) -> String {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!(
      "http://{}/api/v2/vpk-analyse-hashes",
      listener.local_addr().unwrap()
    );
    tokio::spawn(async move {
      let (mut socket, _) = listener.accept().await.unwrap();
      let mut request = Vec::new();
      let mut buffer = [0_u8; 1024];
      loop {
        let read = socket.read(&mut buffer).await.unwrap();
        request.extend_from_slice(&buffer[..read]);
        let text = String::from_utf8_lossy(&request);
        if let Some((head, rest)) = text.split_once("\r\n\r\n") {
          let length = head
            .lines()
            .find_map(|line| {
              let (name, value) = line.split_once(':')?;
              name
                .eq_ignore_ascii_case("content-length")
                .then(|| value.trim().parse::<usize>().ok())?
            })
            .unwrap_or(0);
          if rest.len() >= length {
            break;
          }
        }
        if read == 0 {
          break;
        }
      }
      tokio::time::sleep(delay).await;
      let reply = format!(
        "HTTP/1.1 {status} Scripted\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
        body.len()
      );
      let _ = socket.write_all(reply.as_bytes()).await;
    });
    endpoint
  }

  async fn lookup(endpoint: &str) -> Result<Option<(String, MatchInfo)>, Error> {
    let client = AddonAnalyzer::lookup_client().unwrap();
    AddonAnalyzer::lookup_hashes(&client, endpoint, &parsed_vpk()).await
  }

  #[tokio::test]
  async fn lookup_reports_a_service_error_instead_of_no_match() {
    let endpoint = serve_once(503, "Service Unavailable", std::time::Duration::ZERO).await;
    let error = lookup(&endpoint).await.unwrap_err().to_string();
    assert!(error.contains("503"), "{error}");
  }

  #[tokio::test]
  async fn lookup_reports_an_unreadable_response_instead_of_no_match() {
    let endpoint = serve_once(200, "<html>maintenance</html>", std::time::Duration::ZERO).await;
    assert!(lookup(&endpoint).await.is_err());
  }

  #[tokio::test]
  async fn lookup_reports_an_unreachable_service_instead_of_no_match() {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let endpoint = format!(
      "http://{}/api/v2/vpk-analyse-hashes",
      listener.local_addr().unwrap()
    );
    drop(listener);
    assert!(lookup(&endpoint).await.is_err());
  }

  #[tokio::test]
  async fn lookup_gives_up_on_a_service_that_never_answers() {
    let endpoint = serve_once(200, "[]", std::time::Duration::from_secs(5)).await;
    let client = reqwest::Client::builder()
      .timeout(std::time::Duration::from_millis(200))
      .build()
      .unwrap();
    let result = AddonAnalyzer::lookup_hashes(&client, &endpoint, &parsed_vpk()).await;
    assert!(result.is_err());
  }

  #[tokio::test]
  async fn lookup_returns_no_match_only_when_the_service_found_none() {
    let endpoint = serve_once(200, "[]", std::time::Duration::ZERO).await;
    assert!(lookup(&endpoint).await.unwrap().is_none());
  }

  #[tokio::test]
  async fn lookup_returns_the_matched_mod() {
    let endpoint = serve_once(
      200,
      r#"[{"matchedVpk":{"id":"vpk_1","submissionType":"mod","submissionId":"42","fileId":"100"},
          "match":{"certainty":100,"matchType":"sha256"}}]"#,
      std::time::Duration::ZERO,
    )
    .await;
    let (remote_id, info) = lookup(&endpoint).await.unwrap().unwrap();
    assert_eq!(remote_id, "42");
    assert_eq!(info.certainty, 100);
    assert_eq!(info.file_id.as_deref(), Some("100"));
  }

  #[tokio::test]
  async fn profile_scan_skips_vpks_in_subfolders_the_game_does_not_load() {
    let game = tempfile::tempdir().unwrap();
    let profile = game.path().join("game/citadel/addons/1_profile");
    let staged = profile.join(".dmm-clear");
    std::fs::create_dir_all(&staged).unwrap();
    std::fs::write(staged.join("pak01_dir.vpk"), b"not a vpk").unwrap();

    let result = AddonAnalyzer::new()
      .analyze_local_addons(game.path().to_path_buf(), Some("1_profile".into()), None)
      .await
      .unwrap();

    assert_eq!(result.total_count, 0);
    assert!(result.errors.is_empty(), "{:?}", result.errors);
  }
}
