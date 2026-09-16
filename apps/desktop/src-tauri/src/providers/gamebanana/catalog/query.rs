use super::schema::submission;
use super::store::{
  Catalog, CatalogRecord, SubmissionRow, decode_images, decode_strings, provider_name,
  submission_type_name,
};
use crate::errors::Error;
use crate::providers::{SubmissionProvider, SubmissionRef, SubmissionType};
use diesel::OptionalExtension;
use diesel::dsl::sql;
use diesel::prelude::*;
use diesel::sql_types::{Bool, Double, Text};
use diesel::sqlite::Sqlite;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

const MAX_PAGE_SIZE: u32 = 5_000;

#[derive(Debug, Clone, Copy, Default, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub enum CatalogSort {
  #[default]
  Default,
  LastUpdated,
  DownloadCount,
  Rating,
  ReleaseDate,
}

#[derive(Debug, Clone, Default, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase", default)]
pub struct CatalogQuery {
  pub search: String,
  pub categories: Vec<String>,
  pub heroes: Vec<String>,
  pub author_remote_id: Option<String>,
  pub exclude_filters: bool,
  pub is_audio: Option<bool>,
  pub is_map: Option<bool>,
  pub hide_nsfw: bool,
  pub hide_obsolete: bool,
  #[ts(type = "number | null")]
  pub updated_after: Option<i64>,
  #[ts(type = "number | null")]
  pub added_after: Option<i64>,
  #[ts(type = "number | null")]
  pub added_before: Option<i64>,
  pub favorites: Vec<String>,
  pub include_wips: bool,
  /// Restricts results to one submission type. Selecting `Wip` returns WIPs
  /// regardless of `include_wips`.
  pub submission_type: Option<SubmissionType>,
  #[ts(skip)]
  pub excluded_slugs: Vec<String>,
  pub sort: CatalogSort,
  pub page: u32,
  pub page_size: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogPage {
  pub items: Vec<CatalogRecord>,
  pub total: u64,
  pub page: u32,
  pub page_size: u32,
}

impl Catalog {
  pub async fn query(&self, query: CatalogQuery) -> Result<CatalogPage, Error> {
    let page_size = query.page_size.clamp(1, MAX_PAGE_SIZE);
    let page = query.page;
    self
      .pool
      .run(move |connection| {
        let search = fts_query(&query.search);
        let count = filtered_query(&query, search.as_deref())
          .count()
          .get_result::<i64>(connection)?;
        let total = u64::try_from(count)
          .map_err(|_| Error::Catalog("catalog count was negative".to_string()))?;
        let rows = ordered_query(
          filtered_query(&query, search.as_deref()),
          query.sort,
          search.as_deref(),
        )
        .limit(i64::from(page_size))
        .offset(i64::from(page.saturating_mul(page_size)))
        .load::<SubmissionRow>(connection)?;
        let items = rows
          .into_iter()
          .map(CatalogRecord::try_from)
          .collect::<Result<Vec<_>, _>>()?;
        Ok(CatalogPage {
          items,
          total,
          page,
          page_size,
        })
      })
      .await
  }

  pub async fn get(&self, submission: SubmissionRef) -> Result<Option<CatalogRecord>, Error> {
    self
      .pool
      .run(move |connection| {
        let row = submission::table
          .find((
            provider_name(submission.provider),
            submission_type_name(submission.submission_type),
            submission.submission_id,
          ))
          .filter(submission::is_tombstoned.eq(false))
          .select(SubmissionRow::as_select())
          .first::<SubmissionRow>(connection)
          .optional()
          .map_err(Error::from)?;
        row.map(CatalogRecord::try_from).transpose()
      })
      .await
  }
}

fn filtered_query<'a>(
  query: &'a CatalogQuery,
  search: Option<&'a str>,
) -> submission::BoxedQuery<'a, Sqlite> {
  let mut statement = submission::table
    .filter(submission::is_tombstoned.eq(false))
    .into_boxed();
  match query.submission_type {
    Some(submission_type) => {
      statement =
        statement.filter(submission::submission_type.eq(submission_type_name(submission_type)));
    }
    None if !query.include_wips => {
      statement =
        statement.filter(submission::submission_type.ne(submission_type_name(SubmissionType::Wip)));
    }
    None => {}
  }
  if let Some(search) = search {
    statement = statement.filter(
      sql::<Bool>(
        "EXISTS (SELECT 1 FROM submission_fts
         WHERE submission_fts.provider = submission.provider
           AND submission_fts.submission_type = submission.submission_type
           AND submission_fts.submission_id = submission.submission_id
           AND submission_fts MATCH ",
      )
      .bind::<Text, _>(search)
      .sql(")"),
    );
  }
  if let Some(author_remote_id) = &query.author_remote_id {
    statement = statement.filter(submission::author_remote_id.eq(author_remote_id));
  }
  statement = filter_categories(statement, &query.categories, query.exclude_filters);
  statement = filter_heroes(statement, &query.heroes, query.exclude_filters);
  if let Some(is_audio) = query.is_audio {
    statement = statement.filter(submission::is_audio.eq(is_audio));
  }
  if let Some(is_map) = query.is_map {
    statement = statement.filter(submission::is_map.eq(is_map));
  }
  if query.hide_nsfw {
    statement = statement.filter(submission::is_nsfw.eq(false));
  }
  if query.hide_obsolete {
    statement = statement.filter(submission::is_obsolete.eq(false));
  }
  if let Some(updated_after) = query.updated_after {
    statement = statement.filter(submission::remote_updated_at.ge(updated_after));
  }
  if let Some(added_after) = query.added_after {
    statement = statement.filter(submission::remote_added_at.ge(added_after));
  }
  if let Some(added_before) = query.added_before {
    statement = statement.filter(submission::remote_added_at.lt(added_before));
  }
  if !query.excluded_slugs.is_empty() {
    statement = statement.filter(submission::slug.ne_all(&query.excluded_slugs));
  }
  if !query.favorites.is_empty() {
    statement = statement.filter(submission::slug.eq_any(&query.favorites));
  }
  statement
}

fn filter_heroes<'a>(
  mut statement: submission::BoxedQuery<'a, Sqlite>,
  heroes: &'a [String],
  exclude: bool,
) -> submission::BoxedQuery<'a, Sqlite> {
  if heroes.is_empty() {
    return statement;
  }
  let includes_none = heroes.iter().any(|hero| hero == "None");
  let named = heroes
    .iter()
    .filter(|hero| hero.as_str() != "None")
    .collect::<Vec<_>>();
  statement = match (exclude, includes_none, named.is_empty()) {
    (false, true, false) => statement.filter(
      submission::hero
        .eq_any(named)
        .or(submission::hero.is_null()),
    ),
    (false, true, true) => statement.filter(submission::hero.is_null()),
    (false, false, false) => statement.filter(submission::hero.eq_any(named)),
    (true, true, false) => statement.filter(
      submission::hero
        .ne_all(named)
        .and(submission::hero.is_not_null()),
    ),
    (true, true, true) => statement.filter(submission::hero.is_not_null()),
    (true, false, false) => statement.filter(
      submission::hero
        .ne_all(named)
        .or(submission::hero.is_null()),
    ),
    (_, _, true) => statement,
  };
  statement
}

fn fts_query(search: &str) -> Option<String> {
  let terms = search
    .split_whitespace()
    .map(|term| term.replace('"', "\"\""))
    .filter(|term| !term.is_empty())
    .map(|term| format!("\"{term}\"*"))
    .collect::<Vec<_>>();
  (!terms.is_empty()).then(|| terms.join(" AND "))
}

fn ordered_query<'a>(
  statement: submission::BoxedQuery<'a, Sqlite>,
  sort: CatalogSort,
  search: Option<&'a str>,
) -> submission::BoxedQuery<'a, Sqlite> {
  match (sort, search) {
    (CatalogSort::Default, Some(search)) => statement.order_by((
      sql::<Double>(
        "(SELECT bm25(submission_fts) FROM submission_fts
         WHERE submission_fts.provider = submission.provider
           AND submission_fts.submission_type = submission.submission_type
           AND submission_fts.submission_id = submission.submission_id
           AND submission_fts MATCH ",
      )
      .bind::<Text, _>(search)
      .sql(")")
      .asc(),
      submission::slug.asc(),
    )),
    (CatalogSort::Default | CatalogSort::DownloadCount, _) => {
      statement.order_by((submission::download_count.desc(), submission::slug.asc()))
    }
    (CatalogSort::LastUpdated, _) => {
      statement.order_by((submission::remote_updated_at.desc(), submission::slug.asc()))
    }
    (CatalogSort::Rating, _) => {
      statement.order_by((submission::likes.desc(), submission::slug.asc()))
    }
    (CatalogSort::ReleaseDate, _) => {
      statement.order_by((submission::remote_added_at.desc(), submission::slug.asc()))
    }
  }
}

fn filter_categories<'a>(
  mut statement: submission::BoxedQuery<'a, Sqlite>,
  categories: &'a [String],
  exclude: bool,
) -> submission::BoxedQuery<'a, Sqlite> {
  const PREDEFINED: &[&str] = &[
    "Maps",
    "Skins",
    "Gameplay Modifications",
    "HUD",
    "Model Replacement",
    "Music",
    "Abilities",
    "Weapons",
    "VOs",
    "Killsounds",
    "Killstreak Music",
  ];
  if categories.is_empty() {
    return statement;
  }
  let includes_other = categories.iter().any(|category| category == "Other/Misc");
  let named = categories
    .iter()
    .filter(|category| category.as_str() != "Other/Misc")
    .collect::<Vec<_>>();
  statement = match (exclude, includes_other, named.is_empty()) {
    (false, true, false) => statement.filter(
      submission::category
        .ne_all(PREDEFINED)
        .or(submission::category.eq_any(named)),
    ),
    (false, true, true) => statement.filter(submission::category.ne_all(PREDEFINED)),
    (false, false, false) => statement.filter(submission::category.eq_any(named)),
    (true, true, false) => statement.filter(
      submission::category
        .eq_any(PREDEFINED)
        .and(submission::category.ne_all(named)),
    ),
    (true, true, true) => statement.filter(submission::category.eq_any(PREDEFINED)),
    (true, false, false) => statement.filter(submission::category.ne_all(named)),
    (_, _, true) => statement,
  };
  statement
}

impl TryFrom<SubmissionRow> for CatalogRecord {
  type Error = Error;

  fn try_from(row: SubmissionRow) -> Result<Self, Self::Error> {
    let provider = match row.provider.as_str() {
      "gamebanana" => SubmissionProvider::Gamebanana,
      "local" => SubmissionProvider::Local,
      value => return Err(Error::Catalog(format!("unknown catalog provider: {value}"))),
    };
    let submission_type = match row.submission_type.as_str() {
      "mod" => SubmissionType::Mod,
      "sound" => SubmissionType::Sound,
      "wip" => SubmissionType::Wip,
      value => return Err(Error::Catalog(format!("unknown submission type: {value}"))),
    };
    Ok(Self {
      submission: SubmissionRef {
        provider,
        submission_type,
        submission_id: row.submission_id,
      },
      name: row.name,
      author: row.author,
      author_remote_id: row.author_remote_id,
      description: row.description,
      profile_url: row.profile_url,
      category: row.category,
      hero: row.hero,
      is_audio: row.is_audio,
      is_map: row.is_map,
      is_nsfw: row.is_nsfw,
      is_obsolete: row.is_obsolete,
      is_tombstoned: row.is_tombstoned,
      is_hydrated: row.is_hydrated,
      has_files: row.has_files,
      download_count: u64::try_from(row.download_count)
        .map_err(|_| Error::Catalog("catalog download count was negative".to_string()))?,
      likes: u64::try_from(row.likes)
        .map_err(|_| Error::Catalog("catalog like count was negative".to_string()))?,
      images: decode_images(&row.images)?,
      remote_added_at: row.remote_added_at,
      remote_updated_at: row.remote_updated_at,
      files_updated_at: row.files_updated_at,
      last_seen_snapshot: row.last_seen_snapshot,
      audio_url: row.audio_url,
      tags: decode_strings(&row.tags)?,
      development_state: row.development_state,
      completion_percentage: row
        .completion_percentage
        .map(u8::try_from)
        .transpose()
        .map_err(|_| Error::Catalog("catalog completion percentage out of range".to_string()))?,
    })
  }
}

#[cfg(test)]
mod tests {
  use super::{CatalogQuery, CatalogSort};
  use crate::providers::gamebanana::catalog::{Catalog, CatalogRecord};
  use crate::providers::{SubmissionRef, SubmissionType};
  use tempfile::tempdir;

  fn record(slug: &str, name: &str, category: &str, hero: Option<&str>) -> CatalogRecord {
    CatalogRecord {
      submission: SubmissionRef::parse_slug(slug).unwrap(),
      name: name.to_string(),
      author: "Author".to_string(),
      author_remote_id: Some("42".to_string()),
      description: "searchable description".to_string(),
      profile_url: format!("https://gamebanana.com/mods/{slug}"),
      category: category.to_string(),
      hero: hero.map(str::to_string),
      is_audio: slug.starts_with("snd-"),
      is_map: category == "Maps",
      is_nsfw: false,
      is_obsolete: false,
      is_tombstoned: false,
      is_hydrated: true,
      has_files: true,
      download_count: slug.len() as u64,
      likes: 1,
      images: Vec::new(),
      remote_added_at: 10,
      remote_updated_at: 20,
      files_updated_at: 0,
      last_seen_snapshot: None,
      audio_url: None,
      tags: Vec::new(),
      development_state: None,
      completion_percentage: None,
    }
  }

  #[tokio::test]
  async fn search_filter_sort_and_pagination_are_applied_in_sql() {
    let directory = tempdir().unwrap();
    let catalog = Catalog::open(directory.path().join("catalog.db"), 1)
      .await
      .unwrap();
    catalog
      .upsert_records(vec![
        record("10", "Amber Skin", "Skins", Some("Abrams")),
        record("11", "Blue Skin", "Skins", None),
        record("snd-10", "Amber Voice", "VOs", None),
      ])
      .await
      .unwrap();

    let page = catalog
      .query(CatalogQuery {
        search: "Amber".to_string(),
        categories: vec!["Skins".to_string()],
        sort: CatalogSort::DownloadCount,
        page_size: 1,
        ..CatalogQuery::default()
      })
      .await
      .unwrap();

    assert_eq!(page.total, 1);
    assert_eq!(page.items[0].submission.to_slug().unwrap(), "10");
  }

  #[tokio::test]
  async fn added_range_filters_on_remote_added_at() {
    let directory = tempdir().unwrap();
    let catalog = Catalog::open(directory.path().join("catalog.db"), 1)
      .await
      .unwrap();
    let added_at = |slug: &str, remote_added_at: i64| CatalogRecord {
      remote_added_at,
      ..record(slug, slug, "Skins", None)
    };
    catalog
      .upsert_records(vec![
        added_at("10", 100),
        added_at("11", 200),
        added_at("12", 300),
      ])
      .await
      .unwrap();

    let page = catalog
      .query(CatalogQuery {
        added_after: Some(200),
        added_before: Some(300),
        page_size: 10,
        ..CatalogQuery::default()
      })
      .await
      .unwrap();

    assert_eq!(page.total, 1);
    assert_eq!(page.items[0].submission.to_slug().unwrap(), "11");
  }

  #[tokio::test]
  async fn wips_are_only_returned_when_requested() {
    let directory = tempdir().unwrap();
    let catalog = Catalog::open(directory.path().join("catalog.db"), 1)
      .await
      .unwrap();
    let mut wip = record("wip-10", "Work in progress", "Audio", None);
    wip.development_state = Some("In Development".to_string());
    wip.completion_percentage = Some(40);
    catalog
      .upsert_records(vec![record("10", "Released", "Skins", None), wip])
      .await
      .unwrap();

    let default_page = catalog.query(CatalogQuery::default()).await.unwrap();
    assert_eq!(default_page.total, 1);
    assert_eq!(default_page.items[0].submission.to_slug().unwrap(), "10");

    let with_wips = catalog
      .query(CatalogQuery {
        include_wips: true,
        page_size: 10,
        ..CatalogQuery::default()
      })
      .await
      .unwrap();
    assert_eq!(with_wips.total, 2);
    let stored = with_wips
      .items
      .iter()
      .find(|item| item.submission.to_slug().unwrap() == "wip-10")
      .unwrap();
    assert_eq!(stored.development_state.as_deref(), Some("In Development"));
    assert_eq!(stored.completion_percentage, Some(40));
  }

  #[tokio::test]
  async fn submission_type_restricts_results_to_one_type() {
    let directory = tempdir().unwrap();
    let catalog = Catalog::open(directory.path().join("catalog.db"), 1)
      .await
      .unwrap();
    catalog
      .upsert_records(vec![
        record("10", "Mod", "Skins", None),
        record("snd-10", "Sound", "VOs", None),
        record("wip-10", "Wip", "Skins", None),
      ])
      .await
      .unwrap();

    for (submission_type, slug) in [
      (SubmissionType::Mod, "10"),
      (SubmissionType::Sound, "snd-10"),
      (SubmissionType::Wip, "wip-10"),
    ] {
      let page = catalog
        .query(CatalogQuery {
          submission_type: Some(submission_type),
          page_size: 10,
          ..CatalogQuery::default()
        })
        .await
        .unwrap();
      assert_eq!(page.total, 1, "{submission_type:?}");
      assert_eq!(page.items[0].submission.to_slug().unwrap(), slug);
    }
  }

  #[tokio::test]
  async fn mod_and_sound_details_resolve_by_full_identity() {
    let directory = tempdir().unwrap();
    let catalog = Catalog::open(directory.path().join("catalog.db"), 1)
      .await
      .unwrap();
    catalog
      .upsert_records(vec![
        record("10", "Mod", "Skins", None),
        record("snd-10", "Sound", "VOs", None),
      ])
      .await
      .unwrap();

    let sound = catalog
      .get(SubmissionRef::parse_slug("snd-10").unwrap())
      .await
      .unwrap()
      .unwrap();
    assert_eq!(sound.name, "Sound");
    assert_eq!(sound.author_remote_id.as_deref(), Some("42"));
  }

  #[tokio::test]
  async fn author_filter_matches_the_provider_member_id() {
    let directory = tempdir().unwrap();
    let catalog = Catalog::open(directory.path().join("catalog.db"), 1)
      .await
      .unwrap();
    let mut other_author = record("11", "Other Author", "Skins", None);
    other_author.author_remote_id = Some("99".to_string());
    catalog
      .upsert_records(vec![
        record("10", "Matching Mod", "Skins", None),
        other_author,
      ])
      .await
      .unwrap();

    let page = catalog
      .query(CatalogQuery {
        author_remote_id: Some("42".to_string()),
        page_size: 10,
        ..CatalogQuery::default()
      })
      .await
      .unwrap();

    assert_eq!(page.total, 1);
    assert_eq!(page.items[0].name, "Matching Mod");
  }

  #[tokio::test]
  async fn policy_exclusions_are_applied_before_counting_and_pagination() {
    let directory = tempdir().unwrap();
    let catalog = Catalog::open(directory.path().join("catalog.db"), 1)
      .await
      .unwrap();
    catalog
      .upsert_records(vec![
        record("10", "Allowed", "Skins", None),
        record("snd-10", "Hidden", "VOs", None),
      ])
      .await
      .unwrap();

    let page = catalog
      .query(CatalogQuery {
        excluded_slugs: vec!["snd-10".to_string()],
        page_size: 1,
        ..CatalogQuery::default()
      })
      .await
      .unwrap();

    assert_eq!(page.total, 1);
    assert_eq!(page.items.len(), 1);
    assert_eq!(page.items[0].submission.to_slug().unwrap(), "10");
  }
}
