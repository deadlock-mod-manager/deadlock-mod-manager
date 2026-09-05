use crate::app_runtime::AppHandle;
use crate::errors::Error;
use crate::mod_manager::shard::{ProfileBase, UPDATE_STAGING_PREFIX};
use crate::mod_manager::vpk_manifest::ProfileVpkManifest;
use crate::providers::{SubmissionProvider, SubmissionRef, SubmissionType};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::fs;
use std::path::Path;
use tauri::Manager;

const JOURNAL_FILE: &str = "gamebanana-identity-migration-v1.json";
const MAX_MIGRATIONS: usize = 10_000;

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct IdentityMigration {
  from: String,
  to: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct IdentityMigrationJournal {
  version: u32,
  complete: bool,
  migrations: Vec<IdentityMigration>,
}

#[tauri::command]
pub async fn migrate_submission_identities(
  app_handle: AppHandle,
  migrations: Vec<IdentityMigration>,
) -> Result<(), Error> {
  let app_data = app_handle
    .path()
    .app_local_data_dir()
    .map_err(Error::Tauri)?;
  let game_path = super::state::game_path()?;
  tokio::task::spawn_blocking(move || migrate_on_disk(&app_data, &game_path, migrations))
    .await
    .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}

fn migrate_on_disk(
  app_data: &Path,
  game_path: &Path,
  requested: Vec<IdentityMigration>,
) -> Result<(), Error> {
  let requested = validate_migrations(requested)?;
  if requested.is_empty() {
    return Ok(());
  }

  fs::create_dir_all(app_data)?;
  let journal_path = app_data.join(JOURNAL_FILE);
  let migrations = match read_journal(&journal_path)? {
    Some(journal) => {
      if journal.version != 1 || journal.migrations != requested {
        return Err(Error::InvalidInput(
          "Identity migration journal does not match persisted state".to_string(),
        ));
      }
      if journal.complete {
        return Ok(());
      }
      journal.migrations
    }
    None => {
      write_journal(
        &journal_path,
        &IdentityMigrationJournal {
          version: 1,
          complete: false,
          migrations: requested.clone(),
        },
      )?;
      requested
    }
  };

  migrate_mod_cache(&app_data.join("mods"), &migrations)?;
  migrate_game_files(game_path, &migrations)?;
  write_journal(
    &journal_path,
    &IdentityMigrationJournal {
      version: 1,
      complete: true,
      migrations,
    },
  )
}

fn validate_migrations(
  migrations: Vec<IdentityMigration>,
) -> Result<Vec<IdentityMigration>, Error> {
  if migrations.len() > MAX_MIGRATIONS {
    return Err(Error::InvalidInput(
      "Too many identity migrations".to_string(),
    ));
  }
  let mut seen = BTreeSet::new();
  let mut validated = Vec::with_capacity(migrations.len());
  for migration in migrations {
    let from = SubmissionRef::parse_slug(&migration.from)
      .map_err(|_| Error::InvalidInput("Invalid legacy submission identity".to_string()))?;
    let to = SubmissionRef::parse_slug(&migration.to)
      .map_err(|_| Error::InvalidInput("Invalid migrated submission identity".to_string()))?;
    if from.provider != SubmissionProvider::Gamebanana
      || from.submission_type != SubmissionType::Mod
      || to.provider != SubmissionProvider::Gamebanana
      || to.submission_type != SubmissionType::Sound
      || from.submission_id != to.submission_id
      || !seen.insert(migration.from.clone())
    {
      return Err(Error::InvalidInput(
        "Identity migration must map one GameBanana mod ID to its sound slug".to_string(),
      ));
    }
    validated.push(migration);
  }
  validated.sort_by(|left, right| left.from.cmp(&right.from));
  Ok(validated)
}

fn read_journal(path: &Path) -> Result<Option<IdentityMigrationJournal>, Error> {
  if !path.exists() {
    return Ok(None);
  }
  let bytes = fs::read(path)?;
  serde_json::from_slice(&bytes)
    .map(Some)
    .map_err(|error| Error::InvalidInput(format!("Invalid identity migration journal: {error}")))
}

fn write_journal(path: &Path, journal: &IdentityMigrationJournal) -> Result<(), Error> {
  let temp_path = path.with_extension("json.tmp");
  let bytes = serde_json::to_vec_pretty(journal)
    .map_err(|error| Error::InvalidInput(format!("Failed to encode migration journal: {error}")))?;
  fs::write(&temp_path, bytes)?;
  if path.exists() {
    fs::remove_file(path)?;
  }
  fs::rename(temp_path, path)?;
  Ok(())
}

fn migrate_mod_cache(mods_root: &Path, migrations: &[IdentityMigration]) -> Result<(), Error> {
  if !mods_root.exists() {
    return Ok(());
  }
  for migration in migrations {
    rename_without_overwrite(
      &mods_root.join(&migration.from),
      &mods_root.join(&migration.to),
    )?;
  }
  Ok(())
}

fn migrate_game_files(game_path: &Path, migrations: &[IdentityMigration]) -> Result<(), Error> {
  let citadel = game_path.join("game").join("citadel");
  let addons = citadel.join("addons");
  if addons.exists() {
    for profile in profile_bases(&addons)? {
      migrate_profile(&profile, migrations)?;
    }
  }
  migrate_fonts_conf(
    &citadel.join("panorama").join("fonts").join("fonts.conf"),
    migrations,
  )
}

fn profile_bases(addons: &Path) -> Result<Vec<ProfileBase>, Error> {
  let mut profiles = vec![ProfileBase::new(addons)?];
  for entry in fs::read_dir(addons)? {
    let entry = entry?;
    let path = entry.path();
    let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
      continue;
    };
    if path.is_dir() && (name.starts_with("profile_") || name.starts_with("server_")) {
      profiles.push(ProfileBase::new(path)?);
    }
  }
  Ok(profiles)
}

fn migrate_profile(profile: &ProfileBase, migrations: &[IdentityMigration]) -> Result<(), Error> {
  let manifest_path = profile.join(".dmm.json");
  let has_manifest = manifest_path.exists() || profile.join(".dmm.json.tmp").exists();
  let mut manifest = has_manifest
    .then(|| ProfileVpkManifest::open_for_write(profile))
    .transpose()?;

  for migration in migrations {
    for (_, shard) in profile.existing_shards() {
      rename_prefixed_vpks(&shard, &migration.from, &migration.to)?;
    }
    if let Some(manifest) = manifest.as_mut() {
      manifest.migrate_mod_identity(&migration.from, &migration.to)?;
    }
    rename_without_overwrite(
      &profile.join(format!("{UPDATE_STAGING_PREFIX}{}", migration.from)),
      &profile.join(format!("{UPDATE_STAGING_PREFIX}{}", migration.to)),
    )?;
  }
  if let Some(manifest) = manifest {
    manifest.save(profile)?;
  }
  Ok(())
}

fn rename_prefixed_vpks(directory: &Path, from: &str, to: &str) -> Result<(), Error> {
  if !directory.exists() {
    return Ok(());
  }
  let prefix = format!("{from}_");
  for entry in fs::read_dir(directory)? {
    let entry = entry?;
    let path = entry.path();
    let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
      continue;
    };
    if path.is_file()
      && name.to_ascii_lowercase().ends_with(".vpk")
      && let Some(suffix) = name.strip_prefix(&prefix)
    {
      rename_without_overwrite(&path, &directory.join(format!("{to}_{suffix}")))?;
    }
  }
  Ok(())
}

fn rename_without_overwrite(source: &Path, destination: &Path) -> Result<(), Error> {
  if !source.exists() {
    return Ok(());
  }
  if destination.exists() {
    return Err(Error::ModInvalid(format!(
      "Cannot migrate {} because {} already exists",
      source.display(),
      destination.display()
    )));
  }
  fs::rename(source, destination)?;
  Ok(())
}

fn migrate_fonts_conf(path: &Path, migrations: &[IdentityMigration]) -> Result<(), Error> {
  if !path.exists() {
    return Ok(());
  }
  let mut content = fs::read_to_string(path)?;
  for migration in migrations {
    for marker in [
      "<!-- [DEADLOCK-MOD-MANAGER-FONTS-START:",
      "<!-- [DEADLOCK-MOD-MANAGER-FONTS-END:",
    ] {
      content = content.replace(
        &format!("{marker} {} -->", migration.from),
        &format!("{marker} {} -->", migration.to),
      );
    }
  }
  fs::write(path, content)?;
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::mod_manager::shard::ShardIndex;
  use crate::mod_manager::vpk_manifest::ProfileVpkManifestEntry;
  use std::collections::BTreeMap;

  #[test]
  fn validates_only_matching_mod_to_sound_migrations() {
    assert!(
      validate_migrations(vec![IdentityMigration {
        from: "42".to_string(),
        to: "snd-42".to_string(),
      }])
      .is_ok()
    );
    assert!(
      validate_migrations(vec![IdentityMigration {
        from: "42".to_string(),
        to: "snd-43".to_string(),
      }])
      .is_err()
    );
  }

  #[test]
  fn interrupted_disk_migration_resumes_idempotently() {
    let root = tempfile::tempdir().unwrap();
    let app_data = root.path().join("app-data");
    let game_path = root.path().join("game-root");
    let addons = game_path.join("game/citadel/addons");
    let fonts = game_path.join("game/citadel/panorama/fonts");
    fs::create_dir_all(app_data.join("mods/42")).unwrap();
    fs::create_dir_all(&addons).unwrap();
    fs::create_dir_all(&fonts).unwrap();
    fs::write(addons.join("42_voice.vpk"), b"vpk").unwrap();
    fs::write(
      fonts.join("fonts.conf"),
      "<!-- [DEADLOCK-MOD-MANAGER-FONTS-START: 42 -->\n<!-- [DEADLOCK-MOD-MANAGER-FONTS-END: 42 -->",
    )
    .unwrap();
    ProfileVpkManifest {
      version: 2,
      mods: BTreeMap::from([(
        "42".to_string(),
        ProfileVpkManifestEntry {
          shard: ShardIndex::FIRST,
          disabled_vpks: vec!["42_voice.vpk".to_string()],
          ..ProfileVpkManifestEntry::default()
        },
      )]),
    }
    .save(&addons)
    .unwrap();
    let migration = IdentityMigration {
      from: "42".to_string(),
      to: "snd-42".to_string(),
    };
    write_journal(
      &app_data.join(JOURNAL_FILE),
      &IdentityMigrationJournal {
        version: 1,
        complete: false,
        migrations: vec![migration.clone()],
      },
    )
    .unwrap();

    migrate_on_disk(&app_data, &game_path, vec![migration.clone()]).unwrap();
    migrate_on_disk(&app_data, &game_path, vec![migration]).unwrap();

    assert!(app_data.join("mods/snd-42").is_dir());
    assert!(!app_data.join("mods/42").exists());
    assert!(addons.join("snd-42_voice.vpk").is_file());
    let manifest = ProfileVpkManifest::load(&addons).unwrap();
    assert!(manifest.mods.contains_key("snd-42"));
    assert_eq!(manifest.version, 3);
    assert!(
      fs::read_to_string(fonts.join("fonts.conf"))
        .unwrap()
        .contains("snd-42")
    );
    assert!(
      read_journal(&app_data.join(JOURNAL_FILE))
        .unwrap()
        .unwrap()
        .complete
    );
  }
}
