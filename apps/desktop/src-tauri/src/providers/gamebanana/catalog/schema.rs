use crate::errors::Error;
use diesel::sqlite::SqliteConnection;
use diesel_migrations::{EmbeddedMigrations, MigrationHarness, embed_migrations};

pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations/gamebanana_catalog");

diesel::table! {
  submission (provider, submission_type, submission_id) {
    provider -> Text,
    submission_type -> Text,
    submission_id -> Text,
    slug -> Text,
    name -> Text,
    author -> Text,
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
  connection
    .run_pending_migrations(MIGRATIONS)
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

    assert_eq!(applied.len(), 2);
    assert!(catalog_tables_exist);
  }
}
