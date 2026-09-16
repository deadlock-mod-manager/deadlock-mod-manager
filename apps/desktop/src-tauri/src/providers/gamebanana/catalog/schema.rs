use crate::errors::Error;
use diesel::prelude::*;
use diesel::sql_types::Text;
use diesel::sqlite::SqliteConnection;
use diesel_migrations::{EmbeddedMigrations, MigrationHarness, embed_migrations};

pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations/gamebanana_catalog");

const CREATE_CATALOG_VERSION: &str = "20260830000000";
const ADD_UPDATE_CACHE_VERSION: &str = "20260830000100";
const ADD_PREVIEW_IMAGES_VERSION: &str = "20260910000000";
const ADD_AUTHOR_REMOTE_ID_VERSION: &str = "20260916000000";

diesel::table! {
  submission (provider, submission_type, submission_id) {
    provider -> Text,
    submission_type -> Text,
    submission_id -> Text,
    slug -> Text,
    name -> Text,
    author -> Text,
    author_remote_id -> Nullable<Text>,
    description -> Text,
    profile_url -> Text,
    category -> Text,
    hero -> Nullable<Text>,
    is_audio -> Bool,
    is_map -> Bool,
    is_nsfw -> Bool,
    is_obsolete -> Bool,
    is_tombstoned -> Bool,
    is_hydrated -> Bool,
    has_files -> Bool,
    download_count -> BigInt,
    likes -> BigInt,
    images -> Text,
    remote_added_at -> BigInt,
    remote_updated_at -> BigInt,
    files_updated_at -> BigInt,
    last_seen_snapshot -> Nullable<Text>,
  }
}

diesel::table! {
  sync_cursor (submission_type) {
    submission_type -> Text,
    next_page -> BigInt,
    snapshot_id -> Nullable<Text>,
    snapshot_complete -> Bool,
    high_water_mark -> BigInt,
  }
}

diesel::table! {
  sync_state (key) {
    key -> Text,
    value -> Text,
  }
}

diesel::table! {
  update_cache (provider, submission_type, submission_id) {
    provider -> Text,
    submission_type -> Text,
    submission_id -> Text,
    payload -> Text,
    checked_at -> BigInt,
  }
}

diesel::allow_tables_to_appear_in_same_query!(submission, sync_cursor, sync_state, update_cache);

pub fn migrate(connection: &mut SqliteConnection) -> Result<(), Error> {
  baseline_untracked_catalog(connection)?;
  connection
    .run_pending_migrations(MIGRATIONS)
    .map(|_| ())
    .map_err(catalog_error)
}

fn baseline_untracked_catalog(connection: &mut SqliteConnection) -> Result<(), Error> {
  if !connection
    .applied_migrations()
    .map_err(catalog_error)?
    .is_empty()
  {
    return Ok(());
  }

  let submission_exists = schema_check(
    connection,
    "EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'submission')",
  )?;
  if !submission_exists {
    return Ok(());
  }

  let base_schema_exists = schema_check(
    connection,
    "EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sync_cursor')
      AND EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sync_state')
      AND EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'submission_fts')",
  )?;
  if !base_schema_exists {
    return Err(Error::Catalog(
      "existing catalog schema is incomplete and cannot be migrated safely".to_string(),
    ));
  }

  let existing_migrations = [
    (CREATE_CATALOG_VERSION, true),
    (
      ADD_UPDATE_CACHE_VERSION,
      schema_check(
        connection,
        "EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'update_cache')",
      )?,
    ),
    (
      ADD_PREVIEW_IMAGES_VERSION,
      schema_check(
        connection,
        "EXISTS(SELECT 1 FROM pragma_table_info('submission') WHERE name = 'images')",
      )?,
    ),
    (
      ADD_AUTHOR_REMOTE_ID_VERSION,
      schema_check(
        connection,
        "EXISTS(
          SELECT 1 FROM pragma_table_info('submission') WHERE name = 'author_remote_id'
        )",
      )?,
    ),
  ];

  if existing_migrations
    .windows(2)
    .any(|pair| pair[1].1 && !pair[0].1)
  {
    return Err(Error::Catalog(
      "existing catalog schema has migrations applied out of order".to_string(),
    ));
  }

  connection.transaction::<_, Error, _>(|connection| {
    for (version, exists) in existing_migrations {
      if exists {
        record_migration(connection, version)?;
      }
    }
    Ok(())
  })
}

fn schema_check(connection: &mut SqliteConnection, query: &'static str) -> Result<bool, Error> {
  diesel::select(diesel::dsl::sql::<diesel::sql_types::Bool>(query))
    .get_result(connection)
    .map_err(catalog_error)
}

fn record_migration(connection: &mut SqliteConnection, version: &'static str) -> Result<(), Error> {
  diesel::sql_query("INSERT INTO __diesel_schema_migrations (version) VALUES (?)")
    .bind::<Text, _>(version)
    .execute(connection)
    .map(|_| ())
    .map_err(catalog_error)
}

pub fn catalog_error(error: impl std::fmt::Display) -> Error {
  Error::Catalog(error.to_string())
}

#[cfg(test)]
mod tests {
  use super::migrate;
  use diesel::Connection;
  use diesel::connection::SimpleConnection;
  use diesel::prelude::*;
  use diesel::sqlite::SqliteConnection;
  use diesel_migrations::MigrationHarness;

  #[test]
  fn migrations_create_catalog_tables_and_are_idempotent() {
    let mut connection = SqliteConnection::establish(":memory:").unwrap();
    migrate(&mut connection).unwrap();
    migrate(&mut connection).unwrap();

    let applied = connection.applied_migrations().unwrap();
    let catalog_tables_exist = diesel::select(diesel::dsl::sql::<diesel::sql_types::Bool>(
      "EXISTS(SELECT 1 FROM sqlite_master WHERE name = 'submission_fts')
       AND EXISTS(SELECT 1 FROM sqlite_master WHERE name = 'update_cache')",
    ))
    .get_result::<bool>(&mut connection)
    .unwrap();

    assert_eq!(applied.len(), 4);
    assert!(catalog_tables_exist);
  }

  #[test]
  fn migrations_recover_an_existing_catalog_without_migration_history() {
    let mut connection = SqliteConnection::establish(":memory:").unwrap();
    connection
      .batch_execute(concat!(
        include_str!(
          "../../../../migrations/gamebanana_catalog/20260830000000_create_catalog/up.sql"
        ),
        include_str!(
          "../../../../migrations/gamebanana_catalog/20260830000100_add_update_cache/up.sql"
        ),
        include_str!(
          "../../../../migrations/gamebanana_catalog/20260910000000_add_preview_images/up.sql"
        ),
        "INSERT INTO submission (
          provider, submission_type, submission_id, slug, name, profile_url
        ) VALUES ('gamebanana', 'Mod', '1', 'kept-mod', 'Kept Mod', 'https://example.com');",
      ))
      .unwrap();

    migrate(&mut connection).unwrap();

    let applied = connection.applied_migrations().unwrap();
    let retained_submission = diesel::select(diesel::dsl::sql::<diesel::sql_types::Bool>(
      "EXISTS(SELECT 1 FROM submission WHERE slug = 'kept-mod')",
    ))
    .get_result::<bool>(&mut connection)
    .unwrap();
    let author_remote_id_exists = diesel::select(diesel::dsl::sql::<diesel::sql_types::Bool>(
      "EXISTS(
        SELECT 1 FROM pragma_table_info('submission') WHERE name = 'author_remote_id'
      )",
    ))
    .get_result::<bool>(&mut connection)
    .unwrap();

    assert_eq!(applied.len(), 4);
    assert!(retained_submission);
    assert!(author_remote_id_exists);
  }
}
