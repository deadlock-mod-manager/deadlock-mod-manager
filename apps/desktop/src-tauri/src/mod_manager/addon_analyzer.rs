use crate::app_runtime::AppHandle;
use crate::errors::Error;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::Emitter;
use tokio::task;
use vpk_parser::{VpkParseOptions, VpkParsed, VpkParser};
use vpkmanager::naming;

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
struct ApiMatchedVpk {
  id: String,
  #[serde(rename = "mod")]
  mod_info: ApiModInfo,
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

  /// Call the hash analysis API to identify mods
  async fn analyze_hashes(
    &self,
    vpk_parsed: &VpkParsed,
  ) -> Result<Option<(String, MatchInfo)>, Error> {
    let api_url = crate::commands::state::get_api_url();
    let endpoint = format!("{api_url}/api/v2/vpk-analyse-hashes");

    let request = HashAnalysisRequest {
      sha256: Some(vpk_parsed.fingerprint.sha256.clone()),
      content_signature: vpk_parsed.fingerprint.content_signature.clone(),
      fast_hash: Some(vpk_parsed.fingerprint.fast_hash.clone()),
      file_size: Some(vpk_parsed.fingerprint.file_size as u64),
      merkle_root: vpk_parsed.fingerprint.merkle_root.clone(),
    };

    let client = crate::proxy::build_default_http_client()?;

    log::debug!(
      "Calling hash analysis API for file: {} with hashes: sha256={:?}, contentSig={}, fastHash={:?}",
      vpk_parsed.fingerprint.file_path,
      request.sha256,
      request.content_signature,
      request.fast_hash
    );

    match client.post(&endpoint).json(&request).send().await {
      Ok(response) => {
        if response.status().is_success() {
          match response.json::<Vec<HashAnalysisResponse>>().await {
            Ok(results) => {
              if let Some(result) = results.first() {
                let alternative_matches =
                  result
                    .match_info
                    .alternative_matches
                    .as_ref()
                    .map(|matches| {
                      matches
                        .iter()
                        .map(|m| AlternativeMatch {
                          id: m.id.clone(),
                          mod_name: m.mod_info.name.clone(),
                          mod_author: m.mod_info.author.clone(),
                        })
                        .collect()
                    });

                return Ok(Some((
                  result.matched_vpk.mod_info.remote_id.clone(), // This is the mod's remote ID for API calls
                  MatchInfo {
                    certainty: result.match_info.certainty,
                    match_type: result.match_info.match_type.clone(),
                    mod_name: Some(result.matched_vpk.mod_info.name.clone()),
                    mod_author: Some(result.matched_vpk.mod_info.author.clone()),
                    alternative_matches,
                  },
                )));
              }
            }
            Err(e) => {
              log::warn!("Failed to parse hash analysis response: {e}");
            }
          }
        } else {
          log::warn!("Hash analysis API returned status: {}", response.status());
        }
      }
      Err(e) => {
        log::warn!("Failed to call hash analysis API: {e}");
      }
    }

    Ok(None)
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

    let profile_base =
      crate::mod_manager::profile_base_from_game(&game_path, profile_folder.as_deref())?;

    if !profile_base.exists() {
      log::warn!("Addons folder does not exist: {:?}", profile_base);
      return Ok(AnalyzeAddonsResult {
        addons: Vec::new(),
        total_count: 0,
        errors: vec!["Addons folder not found. Make sure the game is set up for mods.".to_string()],
      });
    }

    let vpk_file_paths: Vec<PathBuf> = match vpkmanager::scan::scan_profile(&profile_base) {
      Ok(found) => found.into_iter().map(|vpk| vpk.path).collect(),
      Err(e) => {
        return Ok(AnalyzeAddonsResult {
          addons: Vec::new(),
          total_count: 0,
          errors: vec![format!("Failed to scan addon shards: {e}")],
        });
      }
    };

    let mut identified_vpk_paths = Vec::new();
    let mut unknown_vpk_paths = Vec::new();

    for vpk_path in vpk_file_paths {
      if Self::identify_local_mod(&vpk_path).is_some() {
        identified_vpk_paths.push(vpk_path);
      } else {
        unknown_vpk_paths.push(vpk_path);
      }
    }

    if !identified_vpk_paths.is_empty() {
      log::info!(
        "Found {} already-identified VPKs (will skip hash analysis) and {} unknown VPKs (will analyze fully)",
        identified_vpk_paths.len(),
        unknown_vpk_paths.len()
      );
    }

    log::info!(
      "Found {} VPK files total, starting parallel analysis",
      identified_vpk_paths.len() + unknown_vpk_paths.len()
    );

    let total_files = identified_vpk_paths.len() + unknown_vpk_paths.len();

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

    for batch in identified_vpk_paths.chunks(batch_size) {
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
            addon_info.remote_id = Self::identify_local_mod(Path::new(&addon_info.file_path));

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

    for batch in unknown_vpk_paths.chunks(batch_size) {
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

    let mut identified_addons = Vec::new();
    let mut unknown_addons = Vec::new();

    for addon in addons {
      if addon.remote_id.is_some() {
        identified_addons.push(addon);
      } else {
        unknown_addons.push(addon);
      }
    }

    log::info!(
      "Skipping hash analysis for {} already-identified addons, analyzing {} unknown addons",
      identified_addons.len(),
      unknown_addons.len()
    );

    log::info!(
      "Starting hash analysis for {} unknown addons",
      unknown_addons.len()
    );

    self.emit_progress(
      &app_handle,
      "analyzing_hashes",
      "Identifying mods using hash analysis...",
      Some(unknown_addons.len()),
      None,
      None,
      50,
    );

    let total_addons = unknown_addons.len();

    for (index, mut addon) in unknown_addons.into_iter().enumerate() {
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

      match self.analyze_hashes(&addon.vpk_parsed).await {
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
        }
      }
      identified_addons.push(addon);
    }

    log::info!(
      "Hash analysis complete: {} addons processed ({} already identified, {} analyzed)",
      identified_addons.len(),
      identified_addons.len() - total_addons,
      total_addons
    );

    // Emit completion progress
    self.emit_progress(
      &app_handle,
      "complete",
      "Analysis complete!",
      Some(identified_addons.len()),
      Some(identified_addons.len()),
      None,
      100,
    );

    Ok(AnalyzeAddonsResult {
      total_count: identified_addons.len(),
      addons: identified_addons,
      errors,
    })
  }

  fn extract_mod_id_from_filename(filename: &str) -> Option<String> {
    naming::mod_id_from_prefix(filename)
  }

  /// Prefer the filename prefix, then the stamp inside the VPK. A stamped file
  /// already names its mod, so it must not go through lockdex hash matching.
  fn identify_local_mod(path: &Path) -> Option<String> {
    path
      .file_name()
      .and_then(|name| name.to_str())
      .and_then(Self::extract_mod_id_from_filename)
      .or_else(|| {
        vpkmanager::fingerprint::read(path)
          .ok()
          .flatten()
          .map(|fingerprint| fingerprint.mod_id)
      })
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
