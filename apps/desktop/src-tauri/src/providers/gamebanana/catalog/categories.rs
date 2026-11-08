use super::store::{Catalog, submission_type_name};
use crate::errors::Error;
use crate::providers::SubmissionType;
use crate::providers::gamebanana::models::Category;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub(super) const CATEGORY_TAXONOMY: &str = "category_taxonomy_v2";
pub(super) const MODEL_REPLACEMENT_ID: u64 = 33154;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CatalogCategory {
  pub key: String,
  pub name: String,
}

impl CatalogCategory {
  pub(super) fn new(submission_type: SubmissionType, id: u64, name: &str) -> Self {
    Self {
      key: format!("{}:{id}", submission_type_name(submission_type)),
      name: name.trim().to_string(),
    }
  }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub(super) struct CategoryTaxonomy {
  pub refreshed_at: u64,
  pub paths: Vec<Vec<CatalogCategory>>,
}

impl CategoryTaxonomy {
  pub fn root_name(
    &self,
    submission_type: SubmissionType,
    path: &[CatalogCategory],
  ) -> Option<&str> {
    let leaf = path.last()?;
    let candidate = self.path_for_leaf(submission_type, &leaf.key)?;
    if candidate != path {
      return None;
    }
    candidate.first().map(|entry| entry.name.as_str())
  }

  pub fn path_for_leaf(
    &self,
    submission_type: SubmissionType,
    key: &str,
  ) -> Option<&[CatalogCategory]> {
    let prefix = format!("{}:", submission_type_name(submission_type));
    self
      .paths
      .iter()
      .find(|candidate| {
        candidate
          .last()
          .is_some_and(|category| category.key.starts_with(&prefix) && category.key == key)
      })
      .map(Vec::as_slice)
  }

  pub fn expand(
    &self,
    submission_type: SubmissionType,
    path: Vec<CatalogCategory>,
  ) -> Vec<CatalogCategory> {
    let Some(leaf) = path.last() else {
      return path;
    };
    let Some(candidate) = self.path_for_leaf(submission_type, &leaf.key) else {
      return path;
    };
    let mut ancestors = candidate.iter();
    // Cached ancestry can fill omissions, but cannot contradict newer source data.
    if path
      .iter()
      .all(|entry| ancestors.by_ref().any(|ancestor| ancestor.key == entry.key))
    {
      candidate.to_vec()
    } else {
      path
    }
  }

  pub fn named_path(
    &self,
    submission_type: SubmissionType,
    root: &str,
    leaf: &str,
  ) -> Option<Vec<CatalogCategory>> {
    let prefix = format!("{}:", submission_type_name(submission_type));
    let mut matches = self.paths.iter().filter(|path| {
      path
        .first()
        .is_some_and(|category| category.key.starts_with(&prefix) && category.name == root.trim())
        && path
          .last()
          .is_some_and(|category| category.name == leaf.trim())
    });
    let path = matches.next()?;
    // Names are a fallback only when they identify one category in this tree.
    matches.next().is_none().then(|| path.clone())
  }
}

pub(crate) fn category_path(
  submission_type: SubmissionType,
  categories: &[Option<&Category>],
) -> Vec<CatalogCategory> {
  let mut path = Vec::new();
  for category in categories.iter().flatten() {
    let id = category.id().or_else(|| {
      (submission_type == SubmissionType::Mod && category.name.trim() == "Model Replacement")
        .then_some(MODEL_REPLACEMENT_ID)
    });
    if let Some(id) = id
      && !category.name.trim().is_empty()
    {
      let entry = CatalogCategory::new(submission_type, id, &category.name);
      if !path
        .iter()
        .any(|existing: &CatalogCategory| existing.key == entry.key)
      {
        path.push(entry);
      }
    }
  }
  path
}

pub(super) fn decode_category_path(value: &str) -> Result<Vec<CatalogCategory>, Error> {
  serde_json::from_str(value).map_err(|error| Error::Catalog(error.to_string()))
}

impl Catalog {
  pub async fn category_root(
    &self,
    submission_type: SubmissionType,
    path: &[CatalogCategory],
  ) -> Result<Option<String>, Error> {
    let taxonomy = self
      .state(CATEGORY_TAXONOMY)
      .await?
      .and_then(|value| serde_json::from_str::<CategoryTaxonomy>(&value).ok())
      .unwrap_or_default();
    Ok(
      taxonomy
        .root_name(submission_type, path)
        .map(str::to_string),
    )
  }

  pub async fn resolve_category_path(
    &self,
    submission_type: SubmissionType,
    path: Vec<CatalogCategory>,
    root_name: Option<&str>,
  ) -> Result<Vec<CatalogCategory>, Error> {
    let taxonomy = self
      .state(CATEGORY_TAXONOMY)
      .await?
      .and_then(|value| serde_json::from_str::<CategoryTaxonomy>(&value).ok())
      .unwrap_or_default();
    let expanded = taxonomy.expand(submission_type, path.clone());
    if root_name.is_some_and(|root| {
      !root.trim().is_empty()
        && expanded
          .first()
          .is_none_or(|entry| entry.name != root.trim())
    }) {
      return Ok(path);
    }
    Ok(expanded)
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn cached_taxonomy_does_not_override_a_changed_explicit_root() {
    let category = |id, name| CatalogCategory::new(SubmissionType::Mod, id, name);
    let taxonomy = CategoryTaxonomy {
      refreshed_at: 1,
      paths: vec![vec![
        category(33154, "Model Replacement"),
        category(44691, "NPCs"),
        category(44458, "Walker"),
      ]],
    };
    let changed_root = vec![category(123, "HUD"), category(44458, "Walker")];
    assert_eq!(
      taxonomy.expand(SubmissionType::Mod, changed_root.clone()),
      changed_root
    );
    let changed_parent = vec![
      category(33154, "Model Replacement"),
      category(999, "New parent"),
      category(44458, "Walker"),
    ];
    assert_eq!(
      taxonomy.expand(SubmissionType::Mod, changed_parent.clone()),
      changed_parent
    );
    let partial = vec![category(44691, "NPCs"), category(44458, "Walker")];
    assert_eq!(taxonomy.expand(SubmissionType::Mod, partial).len(), 3);
  }

  #[tokio::test]
  async fn explicit_root_without_an_id_takes_precedence_over_cached_ancestry() {
    let directory = tempfile::tempdir().unwrap();
    let catalog = Catalog::open(directory.path().join("catalog.db"), 1)
      .await
      .unwrap();
    let walker = CatalogCategory::new(SubmissionType::Mod, 44458, "Walker");
    catalog
      .save_category_taxonomy(CategoryTaxonomy {
        refreshed_at: 1,
        paths: vec![vec![
          CatalogCategory::new(SubmissionType::Mod, 33154, "Model Replacement"),
          walker.clone(),
        ]],
      })
      .await
      .unwrap();
    let path = vec![walker];
    assert_eq!(
      catalog
        .resolve_category_path(SubmissionType::Mod, path.clone(), Some("HUD"))
        .await
        .unwrap(),
      path
    );
  }
}
