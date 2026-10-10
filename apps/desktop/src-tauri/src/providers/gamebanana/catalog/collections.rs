use super::schema::{collection, collection_item, submission};
use super::store::{Catalog, decode_strings, submission_type_name};
use crate::errors::Error;
use crate::providers::gamebanana::{CollectionDescription, IndexCollection};
use crate::providers::{SubmissionProvider, SubmissionRef, SubmissionType};
use diesel::OptionalExtension;
use diesel::prelude::*;
use diesel::sqlite::Sqlite;
use std::collections::{HashMap, HashSet};

/// Collections featured each week.
const FEATURED_PER_WEEK: usize = 5;
/// Featured collections need enough mods to be worth a front-row spot.
const MIN_FEATURED_ITEMS: i64 = 20;
/// Most GameBanana collections are a handful of bookmarks; smaller ones stay unlisted.
pub const MIN_LISTED_ITEMS: i64 = 10;
/// Thumbnails that make up a generated cover for collections without their own.
const PREVIEW_IMAGES: usize = 4;
// Leading items to look at when filling the preview; NSFW and unknown ones are skipped.
const PREVIEW_CANDIDATES: i64 = 12;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CollectionRecord {
  pub collection_id: String,
  pub name: String,
  pub profile_url: String,
  pub cover_url: Option<String>,
  pub author: String,
  pub author_remote_id: Option<String>,
  pub author_avatar_url: Option<String>,
  pub item_count: i64,
  pub likes: i64,
  pub is_nsfw: bool,
  pub remote_added_at: i64,
  pub remote_updated_at: i64,
}

impl CollectionRecord {
  pub fn from_index(record: &IndexCollection) -> Self {
    let submitter = record.submitter.as_ref();
    Self {
      collection_id: record.id.to_string(),
      name: record.name.trim().to_string(),
      profile_url: if record.profile_url.is_empty() {
        format!("https://gamebanana.com/collections/{}", record.id)
      } else {
        record.profile_url.clone()
      },
      cover_url: record.preview_media.thumbnail_url(),
      author: submitter
        .map(|submitter| submitter.name.trim())
        .filter(|name| !name.is_empty())
        .unwrap_or("Unknown")
        .to_string(),
      author_remote_id: submitter
        .and_then(|submitter| (submitter.id > 0).then(|| submitter.id.to_string())),
      author_avatar_url: submitter
        .and_then(|submitter| submitter.avatar_url.clone())
        .filter(|url| url.starts_with("https://")),
      item_count: i64::try_from(record.item_count).unwrap_or(i64::MAX),
      likes: i64::try_from(record.likes).unwrap_or(i64::MAX),
      is_nsfw: record.has_content_ratings,
      remote_added_at: record.date_added.unwrap_or_default().max(0),
      remote_updated_at: record
        .date_modified
        .or(record.date_added)
        .unwrap_or_default()
        .max(0),
    }
  }
}

/// A collection whose items need crawling, with the revision they'll be recorded at.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StaleCollection {
  pub collection_id: String,
  pub item_count: i64,
  pub remote_updated_at: i64,
}

#[derive(Debug, Clone, Queryable, Selectable)]
#[diesel(table_name = collection, check_for_backend(Sqlite))]
pub struct CatalogCollection {
  pub collection_id: String,
  pub name: String,
  pub description: String,
  pub text: String,
  pub profile_url: String,
  pub cover_url: Option<String>,
  pub author: String,
  pub author_remote_id: Option<String>,
  pub author_avatar_url: Option<String>,
  pub item_count: i64,
  pub likes: i64,
  pub is_nsfw: bool,
  pub remote_added_at: i64,
  pub remote_updated_at: i64,
  pub items_synced_at: Option<i64>,
}

/// Weeks since the Unix epoch, rolling over on Monday 00:00 UTC.
pub fn current_week() -> u64 {
  let days = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .unwrap_or_default()
    .as_secs()
    / 86_400;
  // 1970-01-01 was a Thursday; shifting by three days starts weeks on Monday.
  (days + 3) / 7
}

/// This week's featured collections: a fixed pseudo-random pick from the safe,
/// substantial, fully synced ones, so every client features the same set.
pub fn weekly_featured(collections: &[CatalogCollection], week: u64) -> HashSet<String> {
  let mut eligible = collections
    .iter()
    .filter(|collection| {
      // Not every uploader sets GameBanana's content rating, so the name counts too.
      !collection.is_nsfw
        && !collection.name.to_lowercase().contains("nsfw")
        && collection.item_count >= MIN_FEATURED_ITEMS
        && collection.items_synced_at.is_some()
    })
    .map(|collection| {
      let key = format!("{week}:{}", collection.collection_id);
      (fnv1a(key.as_bytes()), &collection.collection_id)
    })
    .collect::<Vec<_>>();
  eligible.sort();
  eligible
    .into_iter()
    .take(FEATURED_PER_WEEK)
    .map(|(_, id)| id.clone())
    .collect()
}

// std's hashers aren't stable across Rust versions, and the pick must agree everywhere.
fn fnv1a(bytes: &[u8]) -> u64 {
  bytes.iter().fold(0xcbf2_9ce4_8422_2325, |hash, byte| {
    (hash ^ u64::from(*byte)).wrapping_mul(0x0000_0100_0000_01b3)
  })
}

#[derive(Insertable)]
#[diesel(table_name = collection)]
struct NewCollection<'a> {
  collection_id: &'a str,
  name: &'a str,
  profile_url: &'a str,
  cover_url: Option<&'a str>,
  author: &'a str,
  author_remote_id: Option<&'a str>,
  author_avatar_url: Option<&'a str>,
  item_count: i64,
  likes: i64,
  is_nsfw: bool,
  remote_added_at: i64,
  remote_updated_at: i64,
  last_seen_at: i64,
}

fn listed() -> diesel::dsl::GtEq<collection::item_count, i64> {
  collection::item_count.ge(MIN_LISTED_ITEMS)
}

impl Catalog {
  /// Saves index metadata and marks each collection as seen; descriptions and items
  /// keep the revision they were fetched at.
  pub async fn upsert_collections(
    &self,
    records: Vec<CollectionRecord>,
    seen_at: i64,
  ) -> Result<(), Error> {
    self
      .pool
      .run(move |connection| {
        connection.transaction::<_, Error, _>(|connection| {
          for record in &records {
            let row = NewCollection {
              collection_id: &record.collection_id,
              name: &record.name,
              profile_url: &record.profile_url,
              cover_url: record.cover_url.as_deref(),
              author: &record.author,
              author_remote_id: record.author_remote_id.as_deref(),
              author_avatar_url: record.author_avatar_url.as_deref(),
              item_count: record.item_count,
              likes: record.likes,
              is_nsfw: record.is_nsfw,
              remote_added_at: record.remote_added_at,
              remote_updated_at: record.remote_updated_at,
              last_seen_at: seen_at,
            };
            diesel::insert_into(collection::table)
              .values(&row)
              .on_conflict(collection::collection_id)
              .do_update()
              .set((
                collection::name.eq(row.name),
                collection::profile_url.eq(row.profile_url),
                collection::cover_url.eq(row.cover_url),
                collection::author.eq(row.author),
                collection::author_remote_id.eq(row.author_remote_id),
                collection::author_avatar_url.eq(row.author_avatar_url),
                collection::item_count.eq(row.item_count),
                collection::likes.eq(row.likes),
                collection::is_nsfw.eq(row.is_nsfw),
                collection::remote_added_at.eq(row.remote_added_at),
                collection::remote_updated_at.eq(row.remote_updated_at),
                collection::last_seen_at.eq(row.last_seen_at),
              ))
              .execute(connection)?;
          }
          Ok(())
        })
      })
      .await
  }

  /// Drops collections a complete index crawl no longer returned.
  pub async fn prune_collections(&self, seen_at: i64) -> Result<usize, Error> {
    self
      .pool
      .run(move |connection| {
        diesel::delete(collection::table.filter(collection::last_seen_at.lt(seen_at)))
          .execute(connection)
          .map_err(Error::from)
      })
      .await
  }

  pub async fn collections_needing_descriptions(&self) -> Result<Vec<u64>, Error> {
    self
      .pool
      .run(|connection| {
        let ids = collection::table
          .filter(listed())
          .filter(
            collection::described_at
              .is_null()
              .or(collection::described_at.lt(collection::remote_updated_at.nullable())),
          )
          .select(collection::collection_id)
          .load::<String>(connection)?;
        Ok(ids.iter().filter_map(|id| id.parse().ok()).collect())
      })
      .await
  }

  /// `described_at` records the revision each description belongs to.
  pub async fn save_collection_descriptions(
    &self,
    descriptions: Vec<(u64, CollectionDescription)>,
  ) -> Result<(), Error> {
    self
      .pool
      .run(move |connection| {
        connection.transaction::<_, Error, _>(|connection| {
          for (collection_id, description) in descriptions {
            let target = collection::table.find(collection_id.to_string());
            diesel::update(target)
              .set((
                collection::description.eq(description.description),
                collection::text.eq(description.text),
                collection::described_at.eq(collection::remote_updated_at.nullable()),
              ))
              .execute(connection)?;
          }
          Ok(())
        })
      })
      .await
  }

  /// Listed collections whose item count or revision changed since their items were
  /// crawled, or whose items are older than `refresh_before`.
  pub async fn collections_needing_items(
    &self,
    refresh_before: i64,
  ) -> Result<Vec<StaleCollection>, Error> {
    self
      .pool
      .run(move |connection| {
        let rows = collection::table
          .filter(listed())
          .filter(
            collection::items_synced_at
              .is_null()
              .or(collection::items_synced_at.lt(refresh_before))
              .or(collection::items_item_count.ne(collection::item_count.nullable()))
              .or(collection::items_updated_at.ne(collection::remote_updated_at.nullable())),
          )
          .order(collection::item_count.desc())
          .select((
            collection::collection_id,
            collection::item_count,
            collection::remote_updated_at,
          ))
          .load::<(String, i64, i64)>(connection)?;
        Ok(
          rows
            .into_iter()
            .map(
              |(collection_id, item_count, remote_updated_at)| StaleCollection {
                collection_id,
                item_count,
                remote_updated_at,
              },
            )
            .collect(),
        )
      })
      .await
  }

  pub async fn replace_collection_items(
    &self,
    stale: StaleCollection,
    items: Vec<SubmissionRef>,
    synced_at: i64,
  ) -> Result<(), Error> {
    self
      .pool
      .run(move |connection| {
        connection.transaction::<_, Error, _>(|connection| {
          diesel::delete(
            collection_item::table.filter(collection_item::collection_id.eq(&stale.collection_id)),
          )
          .execute(connection)?;
          for (position, item) in items.iter().enumerate() {
            diesel::insert_into(collection_item::table)
              .values((
                collection_item::collection_id.eq(&stale.collection_id),
                collection_item::position.eq(i64::try_from(position).unwrap_or(i64::MAX)),
                collection_item::submission_type.eq(submission_type_name(item.submission_type)),
                collection_item::submission_id.eq(&item.submission_id),
              ))
              .execute(connection)?;
          }
          diesel::update(collection::table.find(&stale.collection_id))
            .set((
              collection::items_synced_at.eq(synced_at),
              collection::items_item_count.eq(stale.item_count),
              collection::items_updated_at.eq(stale.remote_updated_at),
            ))
            .execute(connection)?;
          Ok(())
        })
      })
      .await
  }

  pub async fn count_collections(&self) -> Result<i64, Error> {
    self
      .pool
      .run(|connection| {
        collection::table
          .count()
          .get_result(connection)
          .map_err(Error::from)
      })
      .await
  }

  /// Listed collections, largest first.
  pub async fn collections(&self) -> Result<Vec<CatalogCollection>, Error> {
    self
      .pool
      .run(|connection| {
        collection::table
          .filter(listed())
          .order((collection::item_count.desc(), collection::name.asc()))
          .select(CatalogCollection::as_select())
          .load(connection)
          .map_err(Error::from)
      })
      .await
  }

  /// Thumbnails of each collection's first few catalog mods, in collection order, for
  /// collections whose GameBanana cover is only the generic placeholder. NSFW mods
  /// never make it into a cover.
  pub async fn collection_previews(
    &self,
    collection_ids: Vec<String>,
  ) -> Result<HashMap<String, Vec<String>>, Error> {
    self
      .pool
      .run(move |connection| {
        let rows = collection_item::table
          .inner_join(
            submission::table.on(
              submission::provider
                .eq("gamebanana")
                .and(submission::submission_type.eq(collection_item::submission_type))
                .and(submission::submission_id.eq(collection_item::submission_id)),
            ),
          )
          .filter(collection_item::collection_id.eq_any(&collection_ids))
          .filter(collection_item::position.lt(PREVIEW_CANDIDATES))
          .filter(submission::is_nsfw.eq(false))
          .filter(submission::is_tombstoned.eq(false))
          .order((
            collection_item::collection_id,
            collection_item::position.asc(),
          ))
          .select((
            collection_item::collection_id,
            submission::thumbnail_url,
            submission::images,
          ))
          .load::<(String, Option<String>, String)>(connection)?;
        let mut previews = HashMap::<String, Vec<String>>::new();
        for (collection_id, thumbnail_url, images) in rows {
          let images_for = previews.entry(collection_id).or_default();
          if images_for.len() >= PREVIEW_IMAGES {
            continue;
          }
          let image = thumbnail_url.or_else(|| {
            decode_strings(&images)
              .ok()
              .and_then(|images| images.into_iter().next())
          });
          if let Some(image) = image {
            images_for.push(image);
          }
        }
        Ok(previews)
      })
      .await
  }

  /// Heroes each collection's catalog mods are for, most common first.
  pub async fn collection_heroes(
    &self,
    collection_ids: Vec<String>,
  ) -> Result<HashMap<String, Vec<String>>, Error> {
    self
      .pool
      .run(move |connection| {
        let rows = collection_item::table
          .inner_join(
            submission::table.on(
              submission::provider
                .eq("gamebanana")
                .and(submission::submission_type.eq(collection_item::submission_type))
                .and(submission::submission_id.eq(collection_item::submission_id)),
            ),
          )
          .filter(collection_item::collection_id.eq_any(&collection_ids))
          .filter(submission::is_tombstoned.eq(false))
          .select((collection_item::collection_id, submission::hero))
          .load::<(String, Option<String>)>(connection)?;
        let mut counted = HashMap::<String, HashMap<String, usize>>::new();
        for (collection_id, hero) in rows {
          if let Some(hero) = hero {
            *counted
              .entry(collection_id)
              .or_default()
              .entry(hero)
              .or_default() += 1;
          }
        }
        Ok(
          counted
            .into_iter()
            .map(|(collection_id, counts)| {
              let mut heroes = counts.into_iter().collect::<Vec<_>>();
              heroes.sort_by(|(a, a_count), (b, b_count)| b_count.cmp(a_count).then(a.cmp(b)));
              let names = heroes.into_iter().map(|(hero, _)| hero).collect();
              (collection_id, names)
            })
            .collect(),
        )
      })
      .await
  }

  /// A collection and its items in collection order.
  pub async fn collection(
    &self,
    collection_id: String,
  ) -> Result<Option<(CatalogCollection, Vec<SubmissionRef>)>, Error> {
    self
      .pool
      .run(move |connection| {
        let Some(found) = collection::table
          .find(&collection_id)
          .select(CatalogCollection::as_select())
          .first(connection)
          .optional()?
        else {
          return Ok(None);
        };
        let items = collection_item::table
          .filter(collection_item::collection_id.eq(&collection_id))
          .order(collection_item::position.asc())
          .select((
            collection_item::submission_type,
            collection_item::submission_id,
          ))
          .load::<(String, String)>(connection)?
          .into_iter()
          .filter_map(|(submission_type, submission_id)| {
            let submission_type = match submission_type.as_str() {
              "mod" => SubmissionType::Mod,
              "sound" => SubmissionType::Sound,
              "wip" => SubmissionType::Wip,
              _ => return None,
            };
            Some(SubmissionRef {
              provider: SubmissionProvider::Gamebanana,
              submission_type,
              submission_id,
            })
          })
          .collect();
        Ok(Some((found, items)))
      })
      .await
  }
}

#[cfg(test)]
mod tests {
  use super::{CatalogCollection, CollectionRecord, MIN_LISTED_ITEMS, weekly_featured};
  use crate::providers::gamebanana::CollectionDescription;
  use crate::providers::gamebanana::catalog::{Catalog, CatalogRecord};
  use crate::providers::{SubmissionRef, SubmissionType};
  use tempfile::tempdir;

  fn record(id: &str, item_count: i64, updated_at: i64) -> CollectionRecord {
    CollectionRecord {
      collection_id: id.to_string(),
      name: format!("Collection {id}"),
      profile_url: format!("https://gamebanana.com/collections/{id}"),
      cover_url: None,
      author: "curator".to_string(),
      author_remote_id: None,
      author_avatar_url: None,
      item_count,
      likes: 0,
      is_nsfw: false,
      remote_added_at: 1,
      remote_updated_at: updated_at,
    }
  }

  async fn catalog() -> (tempfile::TempDir, Catalog) {
    let directory = tempdir().unwrap();
    let catalog = Catalog::open(directory.path().join("catalog.sqlite3"), 2)
      .await
      .unwrap();
    (directory, catalog)
  }

  #[tokio::test]
  async fn lists_large_collections_first_and_hides_small_ones() {
    let (_directory, catalog) = catalog().await;
    catalog
      .upsert_collections(
        vec![
          record("1", MIN_LISTED_ITEMS + 5, 1),
          record("2", 2, 1),
          record("3", MIN_LISTED_ITEMS + 9, 1),
        ],
        10,
      )
      .await
      .unwrap();
    let ids = catalog
      .collections()
      .await
      .unwrap()
      .into_iter()
      .map(|collection| collection.collection_id)
      .collect::<Vec<_>>();
    assert_eq!(ids, ["3", "1"]);
  }

  fn listed(id: usize, item_count: i64, is_nsfw: bool, synced: bool) -> CatalogCollection {
    CatalogCollection {
      collection_id: id.to_string(),
      name: format!("Collection {id}"),
      description: String::new(),
      text: String::new(),
      profile_url: String::new(),
      cover_url: None,
      author: "curator".to_string(),
      author_remote_id: None,
      author_avatar_url: None,
      item_count,
      likes: 0,
      is_nsfw,
      remote_added_at: 0,
      remote_updated_at: 0,
      items_synced_at: synced.then_some(1),
    }
  }

  #[test]
  fn weekly_featured_rotates_through_safe_substantial_collections() {
    let mut collections = (0..40)
      .map(|id| listed(id, 30, false, true))
      .collect::<Vec<_>>();
    collections.push(listed(100, 30, true, true));
    collections.push(listed(101, 12, false, true));
    collections.push(listed(102, 30, false, false));
    let mut unrated = listed(103, 30, false, true);
    unrated.name = "Dead-Lock NSFW".to_string();
    collections.push(unrated);

    let this_week = weekly_featured(&collections, 2_900);
    assert_eq!(this_week.len(), 5);
    assert_eq!(this_week, weekly_featured(&collections, 2_900));
    assert_ne!(this_week, weekly_featured(&collections, 2_901));
    for week in 2_900..2_960 {
      let featured = weekly_featured(&collections, week);
      assert!(
        ["100", "101", "102", "103"]
          .iter()
          .all(|id| !featured.contains(*id))
      );
    }
  }

  #[tokio::test]
  async fn items_are_recrawled_only_when_the_collection_changes() {
    let (_directory, catalog) = catalog().await;
    catalog
      .upsert_collections(vec![record("1", MIN_LISTED_ITEMS, 100)], 10)
      .await
      .unwrap();
    let stale = catalog.collections_needing_items(0).await.unwrap();
    assert_eq!(stale.len(), 1);
    let items = vec![
      SubmissionRef::parse_slug("snd-5").unwrap(),
      SubmissionRef::parse_slug("7").unwrap(),
    ];
    catalog
      .replace_collection_items(stale[0].clone(), items.clone(), 50)
      .await
      .unwrap();
    assert!(
      catalog
        .collections_needing_items(0)
        .await
        .unwrap()
        .is_empty()
    );
    let (_, saved) = catalog.collection("1".to_string()).await.unwrap().unwrap();
    assert_eq!(saved, items);
    assert_eq!(saved[0].submission_type, SubmissionType::Sound);

    // Items older than the refresh cutoff are crawled again.
    assert_eq!(
      catalog.collections_needing_items(51).await.unwrap().len(),
      1
    );
    // So are items of a collection that gained an item.
    catalog
      .upsert_collections(vec![record("1", MIN_LISTED_ITEMS + 1, 100)], 20)
      .await
      .unwrap();
    assert_eq!(catalog.collections_needing_items(0).await.unwrap().len(), 1);
  }

  #[tokio::test]
  async fn descriptions_follow_the_collection_revision_and_unseen_collections_are_pruned() {
    let (_directory, catalog) = catalog().await;
    catalog
      .upsert_collections(
        vec![
          record("1", MIN_LISTED_ITEMS, 100),
          record("2", MIN_LISTED_ITEMS, 1),
        ],
        10,
      )
      .await
      .unwrap();
    catalog
      .save_collection_descriptions(vec![(
        1,
        CollectionDescription {
          description: "Short".to_string(),
          text: "Long".to_string(),
        },
      )])
      .await
      .unwrap();
    assert_eq!(
      catalog.collections_needing_descriptions().await.unwrap(),
      [2]
    );

    catalog
      .upsert_collections(vec![record("1", MIN_LISTED_ITEMS, 200)], 20)
      .await
      .unwrap();
    assert_eq!(catalog.prune_collections(20).await.unwrap(), 1);
    assert_eq!(
      catalog.collections_needing_descriptions().await.unwrap(),
      [1]
    );
    let (kept, _) = catalog.collection("1".to_string()).await.unwrap().unwrap();
    assert_eq!(kept.description, "Short");
  }

  #[tokio::test]
  async fn previews_use_the_first_safe_catalog_thumbnails() {
    let (_directory, catalog) = catalog().await;
    let mod_record = |id: &str, nsfw: bool| CatalogRecord {
      submission: SubmissionRef::parse_slug(id).unwrap(),
      name: format!("Mod {id}"),
      author: "author".to_string(),
      author_remote_id: None,
      description: String::new(),
      profile_url: format!("https://gamebanana.com/mods/{id}"),
      category: "Skins".to_string(),
      hero: None,
      is_audio: false,
      is_map: false,
      is_nsfw: nsfw,
      is_obsolete: false,
      is_tombstoned: false,
      is_hydrated: true,
      has_files: true,
      download_count: 0,
      likes: 0,
      images: vec![format!("https://images.gamebanana.com/{id}.jpg")],
      thumbnail_url: None,
      remote_added_at: 1,
      remote_updated_at: 1,
      files_updated_at: 0,
      last_seen_snapshot: None,
      audio_url: None,
      tags: Vec::new(),
      development_state: None,
      completion_percentage: None,
    };
    let records = (1..=6)
      .map(|id| {
        let mut record = mod_record(&id.to_string(), id == 2);
        record.hero = Some(if id % 3 == 0 { "Ivy" } else { "Haze" }.to_string());
        record
      })
      .collect();
    catalog.upsert_records(records).await.unwrap();
    catalog
      .upsert_collections(vec![record("1", MIN_LISTED_ITEMS, 1)], 10)
      .await
      .unwrap();
    let stale = catalog.collections_needing_items(0).await.unwrap();
    let items = ["9", "1", "2", "3", "4", "5", "6"]
      .iter()
      .map(|id| SubmissionRef::parse_slug(id).unwrap())
      .collect();
    catalog
      .replace_collection_items(stale[0].clone(), items, 10)
      .await
      .unwrap();

    let previews = catalog
      .collection_previews(vec!["1".to_string()])
      .await
      .unwrap();
    let ids = previews["1"]
      .iter()
      .map(|url| url.trim_start_matches("https://images.gamebanana.com/"))
      .collect::<Vec<_>>();
    assert_eq!(ids, ["1.jpg", "3.jpg", "4.jpg", "5.jpg"]);

    let heroes = catalog
      .collection_heroes(vec!["1".to_string()])
      .await
      .unwrap();
    assert_eq!(heroes["1"], ["Haze", "Ivy"]);
  }
}
