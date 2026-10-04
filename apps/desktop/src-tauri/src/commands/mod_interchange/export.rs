//! Exporter: DMM profiles -> interchange bundle on disk.
//!
//! The frontend store owns the descriptive metadata (names, authors, images,
//! profiles, crosshairs), the profile manifests own where the VPKs are. Files
//! are taken from the profile first and fall back to the mod store, so a mod
//! whose addon files drifted away (deleted by hand, moved by another tool) is
//! still exported. Every mod is written once, even when several profiles use
//! it; profiles only reference it.

use super::format::{
  FORMAT_ID, GameBananaOrigin, InterchangeCrosshair, InterchangeDocument, InterchangeFile,
  InterchangeMod, InterchangeOrigin, InterchangeProfile, InterchangeProfileMod, InterchangeSource,
  LocalOrigin, MANIFEST_FILENAME, SECTION_CROSSHAIRS, SECTION_PROFILES, SubmissionKind,
  is_plain_vpk_name, sha256_file, slugify,
};
use crate::errors::Error;
use crate::mod_manager::ModManager;
use crate::mod_manager::shard::ProfileBase;
use crate::mod_manager::vpk_manifest::ProfileVpkManifest;
use crate::providers::{SubmissionProvider, SubmissionRef, SubmissionType};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

pub const MANAGER_ID: &str = "deadlock-mod-manager";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportModInput {
  pub mod_id: String,
  pub name: String,
  #[serde(default)]
  pub enabled: bool,
  #[serde(default)]
  pub order: u32,
  pub author: Option<String>,
  pub description: Option<String>,
  pub category: Option<String>,
  pub hero: Option<String>,
  pub thumbnail_url: Option<String>,
  pub link: Option<String>,
  pub nsfw: Option<bool>,
  pub file_id: Option<u64>,
  pub file_name: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportProfileInput {
  pub id: String,
  pub name: String,
  #[serde(default)]
  pub description: Option<String>,
  #[serde(default)]
  pub active: bool,
  pub profile_folder: Option<String>,
  #[serde(default)]
  pub crosshair_key: Option<String>,
  pub mods: Vec<ExportModInput>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InterchangeExportRequest {
  pub destination_dir: String,
  pub manager_version: Option<String>,
  /// The active profile first; only it is exported when `include_profiles`
  /// is false.
  pub profiles: Vec<ExportProfileInput>,
  #[serde(default)]
  pub include_profiles: bool,
  #[serde(default)]
  pub crosshairs: Vec<InterchangeCrosshair>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkippedExport {
  pub mod_id: String,
  pub name: String,
  pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InterchangeExportReport {
  pub bundle_path: String,
  pub exported: u32,
  pub profiles: u32,
  pub crosshairs: u32,
  pub skipped: Vec<SkippedExport>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportProgress {
  pub current: usize,
  pub total: usize,
  pub name: String,
}

struct SourceFile {
  path: PathBuf,
  name: String,
  selected: bool,
}

fn vpks_in(dir: &Path) -> Vec<PathBuf> {
  let mut found = Vec::new();
  let mut pending = vec![dir.to_path_buf()];
  while let Some(current) = pending.pop() {
    let Ok(entries) = fs::read_dir(&current) else {
      continue;
    };
    for entry in entries.flatten() {
      let path = entry.path();
      if path.is_dir() {
        pending.push(path);
      } else if path
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("vpk"))
      {
        found.push(path);
      }
    }
  }
  found.sort();
  found
}

fn source_files(
  manifest: Option<&ProfileVpkManifest>,
  base: &ProfileBase,
  store: &Path,
  mod_id: &str,
) -> Vec<SourceFile> {
  let mut files = Vec::new();
  let mut names = HashSet::new();
  if let Some(entry) = manifest.and_then(|m| m.mods.get(mod_id)) {
    let paths = entry.file_paths(base);
    let prefix = format!("{mod_id}_");
    for (index, path) in paths.iter().enumerate() {
      if !path.is_file() {
        continue;
      }
      let on_disk = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_string();
      let original = if entry.enabled {
        entry
          .original_vpk_names
          .get(index)
          .filter(|_| entry.original_vpk_names.len() == paths.len())
          .cloned()
          .unwrap_or(on_disk)
      } else {
        on_disk
          .strip_prefix(&prefix)
          .unwrap_or(&on_disk)
          .to_string()
      };
      if names.insert(original.to_lowercase()) {
        files.push(SourceFile {
          path: path.clone(),
          name: original,
          selected: true,
        });
      }
    }
  }

  // The store holds every VPK of the download, including unselected variants.
  let from_profile = !files.is_empty();
  for path in vpks_in(&store.join(mod_id).join("files")) {
    let Some(name) = path
      .file_name()
      .and_then(|n| n.to_str())
      .map(str::to_string)
    else {
      continue;
    };
    if names.insert(name.to_lowercase()) {
      files.push(SourceFile {
        path,
        name,
        selected: !from_profile,
      });
    }
  }
  files
}

fn origin_for(input: &ExportModInput) -> Option<(String, InterchangeOrigin)> {
  let submission = SubmissionRef::parse_slug(&input.mod_id).ok()?;
  let submission_id = submission.submission_id.clone();
  Some(match (submission.provider, submission.submission_type) {
    (SubmissionProvider::Local, _) => (
      format!("local:{submission_id}"),
      InterchangeOrigin::Local(LocalOrigin {
        local_id: Some(submission_id),
      }),
    ),
    (SubmissionProvider::Gamebanana, kind) => {
      let (type_name, kind) = match kind {
        SubmissionType::Sound => ("sound", SubmissionKind::Sound),
        _ => ("mod", SubmissionKind::Mod),
      };
      (
        format!("gamebanana:{type_name}:{submission_id}"),
        InterchangeOrigin::GameBanana(GameBananaOrigin {
          submission_type: kind,
          submission_id,
          file_id: input.file_id,
          file_name: input.file_name.clone(),
        }),
      )
    }
  })
}

struct ProfileSource {
  base: ProfileBase,
  manifest: Option<ProfileVpkManifest>,
}

/// Removes a half-written bundle folder unless the export finished.
struct PartialBundle<'a>(Option<&'a Path>);

impl Drop for PartialBundle<'_> {
  fn drop(&mut self) {
    if let Some(bundle) = self.0
      && let Err(error) = fs::remove_dir_all(bundle)
    {
      log::warn!(
        "Failed to remove partial export {}: {error}",
        bundle.display()
      );
    }
  }
}

pub fn export(
  manager: &ModManager,
  request: InterchangeExportRequest,
  progress: &dyn Fn(ExportProgress),
) -> Result<InterchangeExportReport, Error> {
  let store = manager.get_mods_store_path()?;
  export_from(manager, &store, request, progress)
}

/// [`export`] with DMM's mod store folder given.
pub fn export_from(
  manager: &ModManager,
  store: &Path,
  request: InterchangeExportRequest,
  progress: &dyn Fn(ExportProgress),
) -> Result<InterchangeExportReport, Error> {
  let destination = PathBuf::from(&request.destination_dir);
  if !destination.is_dir() {
    return Err(Error::InvalidInput(format!(
      "Export folder does not exist: {}",
      destination.display()
    )));
  }

  let mut profiles = request.profiles;
  // Active profile first: its state becomes the library's enabled/order.
  profiles.sort_by_key(|p| !p.active);
  if !request.include_profiles {
    profiles.truncate(1);
  }
  let active_name = profiles.first().map(|p| p.name.clone());

  let mut sources: HashMap<Option<String>, ProfileSource> = HashMap::new();
  for profile in &profiles {
    if sources.contains_key(&profile.profile_folder) {
      continue;
    }
    let base = manager.get_addons_path(profile.profile_folder.as_deref())?;
    let manifest = ProfileVpkManifest::load(&base).ok();
    sources.insert(
      profile.profile_folder.clone(),
      ProfileSource { base, manifest },
    );
  }

  // One library entry per mod, in the active profile's order.
  struct Planned<'a> {
    input: &'a ExportModInput,
    key: String,
    origin: InterchangeOrigin,
    folder: Option<String>,
    enabled_in_active: bool,
  }
  let mut planned: Vec<Planned> = Vec::new();
  let mut key_by_mod_id: HashMap<String, String> = HashMap::new();
  let mut skipped: Vec<SkippedExport> = Vec::new();
  for (profile_index, profile) in profiles.iter().enumerate() {
    let mut mods: Vec<&ExportModInput> = profile.mods.iter().collect();
    mods.sort_by_key(|m| m.order);
    for input in mods {
      if key_by_mod_id.contains_key(&input.mod_id)
        || skipped.iter().any(|s| s.mod_id == input.mod_id)
      {
        continue;
      }
      let Some((key, origin)) = origin_for(input) else {
        skipped.push(SkippedExport {
          mod_id: input.mod_id.clone(),
          name: input.name.clone(),
          reason: "unsupported mod identity".to_string(),
        });
        continue;
      };
      key_by_mod_id.insert(input.mod_id.clone(), key.clone());
      planned.push(Planned {
        input,
        key,
        origin,
        folder: profile.profile_folder.clone(),
        enabled_in_active: profile_index == 0 && input.enabled,
      });
    }
  }

  let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
  let mut bundle = destination.join(format!("deadlock-mods-export-{stamp}"));
  let mut counter = 2;
  while bundle.exists() {
    bundle = destination.join(format!("deadlock-mods-export-{stamp}-{counter}"));
    counter += 1;
  }
  fs::create_dir_all(bundle.join("files"))?;
  let mut cleanup = PartialBundle(Some(&bundle));

  let mut document = InterchangeDocument::new(InterchangeSource {
    manager: MANAGER_ID.to_string(),
    manager_version: request.manager_version.clone(),
    profile_name: active_name,
  });

  let total = planned.len();
  let mut exported_keys = HashSet::new();
  for (index, plan) in planned.iter().enumerate() {
    progress(ExportProgress {
      current: index,
      total,
      name: plan.input.name.clone(),
    });
    let source = &sources[&plan.folder];
    let mut files_on_disk = source_files(
      source.manifest.as_ref(),
      &source.base,
      store,
      &plan.input.mod_id,
    );
    if files_on_disk.is_empty() {
      // Another profile may still have it (same id, own copy).
      for other in sources.values() {
        files_on_disk = source_files(
          other.manifest.as_ref(),
          &other.base,
          store,
          &plan.input.mod_id,
        );
        if !files_on_disk.is_empty() {
          break;
        }
      }
    }
    if files_on_disk.is_empty() {
      skipped.push(SkippedExport {
        mod_id: plan.input.mod_id.clone(),
        name: plan.input.name.clone(),
        reason: "no VPK files on disk".to_string(),
      });
      continue;
    }

    let slug = slugify(&plan.input.name, 40);
    let slug = if slug.is_empty() {
      "mod".to_string()
    } else {
      slug
    };
    let folder = format!("{index:04}-{slug}");
    let mut files = Vec::new();
    let mut used = HashSet::new();
    for source_file in files_on_disk {
      let mut name = if is_plain_vpk_name(&source_file.name) {
        source_file.name.clone()
      } else {
        format!("{slug}_dir.vpk")
      };
      let mut n = 2;
      while !used.insert(name.to_lowercase()) {
        name = format!("{slug}_{n}_dir.vpk");
        n += 1;
      }
      let relative = format!("files/{folder}/{name}");
      let target = bundle.join(&relative);
      fs::create_dir_all(target.parent().unwrap_or(&bundle))?;
      fs::copy(&source_file.path, &target)?;
      files.push(InterchangeFile {
        name,
        path: relative,
        sha256: sha256_file(&target).ok(),
        size: fs::metadata(&target).ok().map(|stat| stat.len()),
        selected: Some(source_file.selected),
      });
    }

    let input = plan.input;
    exported_keys.insert(plan.key.clone());
    document.mods.push(InterchangeMod {
      key: plan.key.clone(),
      name: input.name.clone(),
      enabled: plan.enabled_in_active,
      order: document.mods.len() as u32,
      origin: plan.origin.clone(),
      author: input.author.clone(),
      description: input.description.clone(),
      category: input.category.clone(),
      hero: input.hero.clone(),
      thumbnail_url: input
        .thumbnail_url
        .clone()
        .filter(|url| url.starts_with("http")),
      link: input.link.clone().filter(|url| url.starts_with("http")),
      nsfw: input.nsfw,
      files,
      extensions: Some(serde_json::json!({ MANAGER_ID: { "modId": input.mod_id } })),
    });
  }
  progress(ExportProgress {
    current: total,
    total,
    name: String::new(),
  });

  if request.include_profiles {
    for profile in &profiles {
      let mut mods: Vec<InterchangeProfileMod> = profile
        .mods
        .iter()
        .filter_map(|input| {
          let key = key_by_mod_id.get(&input.mod_id)?;
          exported_keys.contains(key).then(|| InterchangeProfileMod {
            mod_key: key.clone(),
            enabled: input.enabled,
            order: input.order,
          })
        })
        .collect();
      mods.sort_by_key(|m| m.order);
      document.profiles.push(InterchangeProfile {
        key: format!("profile:{}", profile.id),
        name: profile.name.clone(),
        active: profile.active,
        description: profile.description.clone(),
        mods,
        crosshair_key: profile.crosshair_key.clone(),
        autoexec: None,
      });
    }
    document.include(SECTION_PROFILES);
  }
  if !request.crosshairs.is_empty() {
    document.crosshairs = request.crosshairs;
    document.include(SECTION_CROSSHAIRS);
  }

  debug_assert_eq!(document.format, FORMAT_ID);
  let json = serde_json::to_vec_pretty(&document)
    .map_err(|e| Error::InvalidInput(format!("could not serialize export: {e}")))?;
  fs::write(bundle.join(MANIFEST_FILENAME), json)?;
  cleanup.0 = None;

  Ok(InterchangeExportReport {
    bundle_path: bundle.to_string_lossy().to_string(),
    exported: document.mods.len() as u32,
    profiles: document.profiles.len() as u32,
    crosshairs: document.crosshairs.len() as u32,
    skipped,
  })
}
