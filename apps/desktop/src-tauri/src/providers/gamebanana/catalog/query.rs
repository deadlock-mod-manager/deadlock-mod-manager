use super::schema::submission;
use super::store::{Catalog, CatalogRecord, SubmissionRow, provider_name, submission_type_name};
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
  pub exclude_filters: bool,
  pub is_audio: Option<bool>,
  pub is_map: Option<bool>,
  pub hide_nsfw: bool,
  pub hide_obsolete: bool,
  #[ts(type = "number | null")]
  pub updated_after: Option<i64>,
  pub favorites: Vec<String>,
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
      remote_added_at: row.remote_added_at,
      remote_updated_at: row.remote_updated_at,
      files_updated_at: row.files_updated_at,
      last_seen_snapshot: row.last_seen_snapshot,
    })
  }
}

#[cfg(test)]
mod tests {
  use super::{CatalogQuery, CatalogSort};
  use crate::providers::SubmissionRef;
  use crate::providers::gamebanana::catalog::{Catalog, CatalogRecord};
  use tempfile::tempdir;

  fn record(slug: &str, name: &str, category: &str, hero: Option<&str>) -> CatalogRecord {
    CatalogRecord {
      submission: SubmissionRef::parse_slug(slug).unwrap(),
      name: name.to_string(),
      author: "Author".to_string(),
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
      remote_added_at: 10,
      remote_updated_at: 20,
      files_updated_at: 0,
      last_seen_snapshot: None,
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
    assert_eq!(page.items[0].submission.to_slug(), "10");
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
    assert_eq!(page.items[0].submission.to_slug(), "10");
  }
}
