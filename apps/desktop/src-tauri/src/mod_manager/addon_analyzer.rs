use crate::app_runtime::AppHandle;
use crate::errors::Error;
use crate::mod_manager::shard::ProfileBase;
use crate::mod_manager::vpk_manifest::ProfileVpkManifest;
use crate::providers::{SubmissionProvider, SubmissionRef};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
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
  /// The mod the profile's `.dmm.json` assigns this exact file to, if exactly
  /// one entry does. The library may have lost it (Clear Mods State), so the
  /// frontend restores it from the manifest instead of re-identifying it.
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub manifest_mod_id: Option<String>,
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
              if let Some(result) = results.first()
                && let Some(remote_id) = result.matched_vpk.remote_id()
              {
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
                return Ok(Some((
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

    let profile_base = ProfileBase::new(&addons_path)?;
    let mut errors = Vec::new();
    let owners = match ProfileVpkManifest::load(&addons_path) {
      Ok(manifest) => Self::manifest_owners(&manifest, &profile_base),
      Err(e) => {
        log::warn!("Could not read the profile manifest for analysis: {e}");
        errors.push(format!(
          "Could not read which files DMM installed ({e}). Files were identified without it."
        ));
        HashMap::new()
      }
    };
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
            addon_info.manifest_mod_id = Self::owner_of(&owners, &addon_info.file_path);

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
          Ok(Ok(mut addon_info)) => {
            addon_info.manifest_mod_id = Self::owner_of(&owners, &addon_info.file_path);
            // DMM's own record of a catalog mod is as good as a hash match, and
            // keeps working when the hash service doesn't know the file.
            if let Some(owner) = &addon_info.manifest_mod_id
              && Self::is_catalog_id(owner)
            {
              addon_info.remote_id = Some(owner.clone());
            }
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
      // A local import the catalog doesn't know is still DMM's: keep the
      // manifest's owner rather than asking the user to identify it.
      if addon.remote_id.is_none() {
        addon.remote_id = addon.manifest_mod_id.clone();
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

  /// Every file a manifest entry claims, keyed by its path in this profile.
  /// A file two entries claim is left out: neither owner can be trusted.
  fn manifest_owners(
    manifest: &ProfileVpkManifest,
    profile_base: &ProfileBase,
  ) -> HashMap<PathBuf, Option<String>> {
    let mut owners: HashMap<PathBuf, Option<String>> = HashMap::new();
    for (mod_id, entry) in &manifest.mods {
      for path in entry.file_paths(profile_base) {
        owners
          .entry(path)
          .and_modify(|owner| *owner = None)
          .or_insert_with(|| Some(mod_id.clone()));
      }
    }
    owners
  }

  fn owner_of(owners: &HashMap<PathBuf, Option<String>>, file_path: &str) -> Option<String> {
    owners.get(Path::new(file_path)).cloned().flatten()
  }

  fn is_catalog_id(mod_id: &str) -> bool {
    SubmissionRef::parse_slug(mod_id)
      .is_ok_and(|submission| submission.provider == SubmissionProvider::Gamebanana)
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
    self.analyze_hashes(&info.vpk_parsed).await
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
      manifest_mod_id: None,
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

  fn write_vpk(dir: &std::path::Path, name: &str, contents: &str) {
    let source = tempfile::tempdir().unwrap();
    std::fs::write(source.path().join("fixture.txt"), contents).unwrap();
    std::fs::create_dir_all(dir).unwrap();
    vpkmanager::pack_directory(source.path(), &dir.join(name)).unwrap();
  }

  /// A profile as DMM leaves it, with the same `pak01_dir.vpk` name in two
  /// shards, a two-file mod and a disabled mod parked under its prefix.
  fn managed_profile() -> (tempfile::TempDir, PathBuf) {
    let game = tempfile::tempdir().unwrap();
    let citadel = game.path().join("game/citadel");
    let base = citadel.join("addons/1_profile");
    let overflow = citadel.join("addons2/1_profile");
    write_vpk(&base, "pak01_dir.vpk", "two-file mod, first");
    write_vpk(&base, "pak02_dir.vpk", "two-file mod, second");
    write_vpk(&overflow, "pak01_dir.vpk", "overflow mod");
    write_vpk(&base, "900003_red.vpk", "disabled mod");
    std::fs::write(
      base.join(".dmm.json"),
      r#"{"version":3,"mods":{
        "900001":{"enabled":true,"order":0,"shard":1,"currentVpks":["pak01_dir.vpk","pak02_dir.vpk"]},
        "900002":{"enabled":true,"order":1,"shard":2,"currentVpks":["pak01_dir.vpk"]},
        "900003":{"enabled":false,"order":2,"disabledVpks":["900003_red.vpk"]}}}"#,
    )
    .unwrap();
    (game, base)
  }

  #[tokio::test]
  async fn identifies_anonymous_pak_files_from_the_profile_manifest() {
    // Tests have no API server (http://localhost:9000), so any file sent to
    // hash identification comes back unidentified.
    let _ = crate::runtime_environment::initialize();
    let (game, base) = managed_profile();
    let manifest = std::fs::read(base.join(".dmm.json")).unwrap();

    let result = AddonAnalyzer::new()
      .analyze_local_addons(game.path().to_path_buf(), Some("1_profile".into()), None)
      .await
      .unwrap();

    let mut identities: Vec<(String, Option<String>)> = result
      .addons
      .iter()
      .map(|addon| {
        let path = PathBuf::from(&addon.file_path);
        let shard = path.parent().unwrap().parent().unwrap().file_name().unwrap();
        (
          format!("{}/{}", shard.to_string_lossy(), addon.file_name),
          addon.remote_id.clone(),
        )
      })
      .collect();
    identities.sort();
    assert_eq!(
      identities,
      [
        ("addons/900003_red.vpk".into(), Some("900003".into())),
        ("addons/pak01_dir.vpk".into(), Some("900001".into())),
        ("addons/pak02_dir.vpk".into(), Some("900001".into())),
        ("addons2/pak01_dir.vpk".into(), Some("900002".into())),
      ]
    );
    assert!(result.addons.iter().all(|addon| addon.match_info.is_none()));
    assert!(result.errors.is_empty(), "{:?}", result.errors);
    assert_eq!(std::fs::read(base.join(".dmm.json")).unwrap(), manifest);
    assert!(
      result
        .addons
        .iter()
        .all(|addon| addon.manifest_mod_id == addon.remote_id),
      "every file should carry its manifest owner"
    );
  }

  #[test]
  fn a_file_two_entries_claim_has_no_trusted_owner() {
    let game = tempfile::tempdir().unwrap();
    let base_path = game.path().join("game/citadel/addons/1_profile");
    std::fs::create_dir_all(&base_path).unwrap();
    let manifest: ProfileVpkManifest = serde_json::from_str(
      r#"{"version":3,"mods":{
        "900001":{"enabled":true,"shard":1,"currentVpks":["pak01_dir.vpk","pak02_dir.vpk"]},
        "900002":{"enabled":true,"shard":1,"currentVpks":["pak02_dir.vpk"]}}}"#,
    )
    .unwrap();
    let owners =
      AddonAnalyzer::manifest_owners(&manifest, &ProfileBase::new(&base_path).unwrap());
    let owner = |name: &str| {
      AddonAnalyzer::owner_of(&owners, &base_path.join(name).to_string_lossy())
    };
    assert_eq!(owner("pak01_dir.vpk").as_deref(), Some("900001"));
    assert_eq!(owner("pak02_dir.vpk"), None);
    assert_eq!(owner("pak03_dir.vpk"), None);
  }

  #[test]
  fn only_gamebanana_owners_skip_hash_identification() {
    assert!(AddonAnalyzer::is_catalog_id("900001"));
    assert!(AddonAnalyzer::is_catalog_id("snd-42"));
    assert!(!AddonAnalyzer::is_catalog_id("local-unidentified"));
    assert!(!AddonAnalyzer::is_catalog_id(
      "local-0f8fad5b-d9cb-469f-a165-70867728950e"
    ));
  }

  #[tokio::test]
  async fn an_unreadable_manifest_is_reported_and_analysis_continues() {
    let game = tempfile::tempdir().unwrap();
    let base = game.path().join("game/citadel/addons/1_profile");
    write_vpk(&base, "900003_red.vpk", "disabled mod");
    std::fs::write(base.join(".dmm.json"), b"{ not json").unwrap();

    let result = AddonAnalyzer::new()
      .analyze_local_addons(game.path().to_path_buf(), Some("1_profile".into()), None)
      .await
      .unwrap();

    assert_eq!(result.total_count, 1);
    assert_eq!(result.addons[0].remote_id.as_deref(), Some("900003"));
    assert_eq!(result.addons[0].manifest_mod_id, None);
    assert_eq!(result.errors.len(), 1, "{:?}", result.errors);
    assert!(result.errors[0].contains("Could not read which files DMM installed"));
  }
}
