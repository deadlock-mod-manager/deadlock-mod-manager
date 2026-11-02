//! Advisory comparisons only: removed IDs can be intentional. Console evidence
//! cannot establish which mod was active when a historical line was written.
use super::{Kv3Value, Resource, kv3, resources::ResourceSnapshot};
use serde::Serialize;
use std::{
  collections::BTreeSet,
  fs::File,
  io::{Read, Seek, SeekFrom},
  time::UNIX_EPOCH,
};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub enum HudCheckStatus {
  Compared,
  NoBaseline,
  Unsupported,
  Unreadable,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct HudCheck {
  pub mod_id: String,
  pub source_vpk: String,
  pub file_path: String,
  pub status: HudCheckStatus,
  pub missing_panels: Vec<String>,
  pub detail: Option<String>,
  pub console: HudConsoleEvidence,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct HudConsoleEvidence {
  pub modified_at: Option<f64>,
  pub truncated: bool,
  pub error: Option<String>,
  pub lines: Vec<String>,
}

const LOG_LIMIT: u64 = 256 * 1024;

fn read_console(path: &std::path::Path) -> HudConsoleEvidence {
  let mut evidence = HudConsoleEvidence {
    modified_at: None,
    truncated: false,
    error: None,
    lines: vec![],
  };
  let result = (|| -> std::io::Result<()> {
    let mut file = File::open(path)?;
    let metadata = file.metadata()?;
    evidence.modified_at = metadata
      .modified()
      .ok()
      .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
      .map(|duration| duration.as_secs_f64() * 1000.0);
    evidence.truncated = metadata.len() > LOG_LIMIT;
    file.seek(SeekFrom::Start(metadata.len().saturating_sub(LOG_LIMIT)))?;
    let mut bytes = Vec::new();
    file.take(LOG_LIMIT).read_to_end(&mut bytes)?;
    let text = String::from_utf8_lossy(&bytes);
    let mut lines = text.lines();
    if evidence.truncated {
      lines.next();
    }
    evidence.lines = lines
      .filter(|line| {
        let lower = line.to_ascii_lowercase();
        lower.contains("unable to find child")
          || lower.contains("unable to load layout file")
          || (lower.contains("layout") && (lower.contains("failed") || lower.contains("error")))
      })
      .rev()
      .take(40)
      .map(|line| line.chars().take(500).collect())
      .collect();
    Ok(())
  })();
  if let Err(error) = result {
    evidence.error = Some(error.to_string());
  }
  evidence
}

fn panel_ids(bytes: &[u8]) -> Result<BTreeSet<String>, String> {
  let resource = Resource::parse(bytes).map_err(|error| error.to_string())?;
  let payload = resource
    .find_block(*b"LaCo")
    .ok_or("Missing or unreadable LaCo block")?;
  let tree = kv3::decode(payload).map_err(|error| error.to_string())?;
  let root = tree
    .get("m_AST")
    .and_then(|ast| ast.get("m_pRoot"))
    .ok_or("Unsupported layout AST")?;
  collect_ids(root)
}

fn collect_ids(root: &Kv3Value) -> Result<BTreeSet<String>, String> {
  root
    .get("eType")
    .and_then(Kv3Value::as_str)
    .ok_or("Unsupported layout root")?;
  let mut ids = BTreeSet::new();
  let mut pending = vec![(root, 0usize)];
  let mut visited = 0usize;
  while let Some((node, depth)) = pending.pop() {
    if matches!(node, Kv3Value::Null) {
      continue;
    }
    visited += 1;
    if depth > 128 || visited > 100_000 {
      return Err("Layout AST exceeds scan limits".into());
    }
    let kind = node.get("eType").and_then(Kv3Value::as_str).unwrap_or("");
    if kind.is_empty() && node.get("name").and_then(Kv3Value::as_str).is_none() {
      return Err("Unsupported layout node".into());
    }
    // Snippet IDs are templates, not guaranteed instantiated panels.
    if kind == "SNIPPET" {
      continue;
    }
    if kind == "PANEL_ATTRIBUTE" && node.get("name").and_then(Kv3Value::as_str) == Some("id") {
      let id = node
        .get("child")
        .and_then(|child| child.get("name"))
        .and_then(Kv3Value::as_str)
        .ok_or("Unsupported panel ID")?;
      if !id.is_empty() {
        ids.insert(id.to_string());
      }
      continue;
    }
    if let Some(child) = node.get("child") {
      pending.push((child, depth + 1));
    }
    if let Some(children) = node.get("vecChildren") {
      let children = children.as_array().ok_or("Unsupported layout children")?;
      pending.extend(children.iter().map(|child| (child, depth + 1)));
    }
  }
  Ok(ids)
}

pub(super) fn analyze(resources: &ResourceSnapshot) -> Vec<HudCheck> {
  let console = read_console(&resources.console_log());
  resources
    .mod_paths()
    .filter(|path| path.starts_with("panorama/layout/") && path.ends_with(".vxml_c"))
    .filter_map(|path| {
      let provider = resources.provider(path)?;
      let mut check = HudCheck {
        mod_id: provider.mod_id?,
        source_vpk: provider.archive.display().to_string(),
        file_path: path.clone(),
        status: HudCheckStatus::Compared,
        missing_panels: vec![],
        detail: None,
        console: console.clone(),
      };
      let result = (|| {
        let (_, bytes) = resources
          .resolve(path)
          .map_err(|error| (HudCheckStatus::Unreadable, error.to_string()))?
          .ok_or((
            HudCheckStatus::Unreadable,
            "Winning resource unavailable".into(),
          ))?;
        let baseline = resources
          .game_bytes(path)
          .map_err(|error| (HudCheckStatus::Unreadable, error.to_string()))?
          .ok_or((
            HudCheckStatus::NoBaseline,
            "No installed vanilla layout; custom layout not compared".into(),
          ))?;
        let current = panel_ids(&bytes).map_err(|error| (HudCheckStatus::Unsupported, error))?;
        let vanilla = panel_ids(&baseline).map_err(|error| (HudCheckStatus::Unsupported, error))?;
        check.missing_panels = vanilla.difference(&current).cloned().collect();
        Ok::<(), (HudCheckStatus, String)>(())
      })();
      if let Err((status, detail)) = result {
        check.status = status;
        check.detail = Some(detail);
      }
      correlate(&mut check);
      Some(check)
    })
    .collect()
}

pub(super) fn refresh_console(checks: &mut [HudCheck], path: &std::path::Path) {
  if checks.is_empty() {
    return;
  }
  let console = read_console(path);
  for check in checks {
    check.console = console.clone();
    correlate(check);
  }
}

fn correlate(check: &mut HudCheck) {
  // Matching IDs may occur in several layouts. Preserve every association;
  // historical log lines never establish which profile or mod caused them.
  check.console.lines.retain(|line| {
    check
      .missing_panels
      .iter()
      .any(|id| line.contains(&format!("'{id}'")) || line.contains(&format!("\"{id}\"")))
      || line
        .replace('\\', "/")
        .to_ascii_lowercase()
        .contains(check.file_path.trim_end_matches("_c"))
  });
}

#[cfg(test)]
mod tests {
  use super::*;
  fn object(fields: Vec<(&str, Kv3Value)>) -> Kv3Value {
    Kv3Value::Object(
      fields
        .into_iter()
        .map(|(key, value)| (key.into(), value))
        .collect(),
    )
  }
  fn panel(id: &str) -> Kv3Value {
    object(vec![
      ("eType", Kv3Value::String("PANEL_ATTRIBUTE".into())),
      ("name", Kv3Value::String("id".into())),
      ("child", object(vec![("name", Kv3Value::String(id.into()))])),
    ])
  }
  fn layout(ids: &[&str]) -> Vec<u8> {
    let root = object(vec![
      ("eType", Kv3Value::String("ROOT".into())),
      (
        "vecChildren",
        Kv3Value::Array(ids.iter().map(|id| panel(id)).collect()),
      ),
    ]);
    let tree = object(vec![("m_AST", object(vec![("m_pRoot", root)]))]);
    let Kv3Value::Object(rows) = tree else {
      unreachable!()
    };
    let mut bytes = super::super::tests::compiled_resource(rows);
    bytes[16..20].copy_from_slice(b"LaCo");
    bytes
  }
  #[test]
  fn case_sensitive_ids_exclude_snippet_templates() {
    let snippet = object(vec![
      ("eType", Kv3Value::String("SNIPPET".into())),
      ("vecChildren", Kv3Value::Array(vec![panel("TemplateOnly")])),
    ]);
    let root = object(vec![
      ("eType", Kv3Value::String("ROOT".into())),
      (
        "vecChildren",
        Kv3Value::Array(vec![panel("Hud"), panel("hud"), snippet]),
      ),
    ]);
    assert_eq!(
      collect_ids(&root).unwrap(),
      BTreeSet::from(["Hud".into(), "hud".into()])
    );
    assert_eq!(
      panel_ids(&layout(&["Hud"])).unwrap(),
      BTreeSet::from(["Hud".into()])
    );
  }
  #[test]
  fn only_winning_provider_is_compared_and_failures_remain_visible() {
    use super::super::{
      LocalizationModInput,
      resources::{ResourceSnapshot, tests::pack},
    };
    let temp = tempfile::tempdir().unwrap();
    let citadel = temp.path().join("citadel");
    let first = temp.path().join("shard0");
    let second = temp.path().join("shard1");
    std::fs::create_dir_all(&citadel).unwrap();
    let path = "panorama/layout/test.vxml_c";
    pack(&citadel, "pak01", &[(path, &layout(&["Hud", "NewPanel"]))]);
    let winner = pack(
      &first,
      "pak01",
      &[
        (path, &layout(&["Hud"])),
        ("panorama/layout/custom.vxml_c", b"custom"),
        ("panorama/layout/bad.vxml_c", b"invalid"),
      ],
    );
    let loser = pack(&second, "pak01", &[(path, &layout(&["Hud", "NewPanel"]))]);
    std::fs::create_dir_all(citadel.join("panorama/layout")).unwrap();
    std::fs::write(citadel.join("panorama/layout/bad.vxml_c"), b"bad").unwrap();
    std::fs::write(
      citadel.join("console.log"),
      "Unable to find child 'NewPanel'\n",
    )
    .unwrap();
    let inputs = vec![
      LocalizationModInput {
        mod_id: "unmanaged:0:pak01".into(),
        vpks: vec![winner.clone()],
      },
      LocalizationModInput {
        mod_id: "other-provider".into(),
        vpks: vec![loser],
      },
    ];
    assert!(super::super::has_checkable_resources(&inputs[0]).unwrap());
    assert!(super::super::reads_compiled_baseline(path));
    let snapshot = ResourceSnapshot::open(&citadel, &inputs).unwrap();
    let checks = analyze(&snapshot);
    assert_eq!(checks.len(), 3);
    let compared = checks.iter().find(|check| check.file_path == path).unwrap();
    assert_eq!(compared.mod_id, "unmanaged:0:pak01");
    assert_eq!(compared.source_vpk, winner.display().to_string());
    assert_eq!(compared.missing_panels, vec!["NewPanel"]);
    assert_eq!(compared.console.lines.len(), 1);
    let mut ambiguous = vec![compared.clone(), compared.clone()];
    ambiguous[1].file_path = "panorama/layout/another.vxml_c".into();
    let log = citadel.join("console.log");
    std::fs::write(&log, "Unable to find child 'NewPanel'\n").unwrap();
    File::options()
      .write(true)
      .open(&log)
      .unwrap()
      .set_times(
        std::fs::FileTimes::new().set_modified(UNIX_EPOCH + std::time::Duration::from_secs(60)),
      )
      .unwrap();
    refresh_console(&mut ambiguous, &log);
    assert!(ambiguous.iter().all(|check| check.console.lines.len() == 1));
    assert_eq!(ambiguous[0].console.modified_at, Some(60_000.0));
    std::fs::write(&log, "Layout failed: PANORAMA\\LAYOUT\\TEST.VXML\n").unwrap();
    refresh_console(&mut ambiguous, &log);
    assert_eq!(ambiguous[0].console.lines.len(), 1);
    assert!(ambiguous[1].console.lines.is_empty());
    std::fs::write(
      &log,
      "Unable to load layout file 'panorama/layout/test.vxml'\n",
    )
    .unwrap();
    refresh_console(&mut ambiguous, &log);
    assert_eq!(ambiguous[0].console.lines.len(), 1);
    assert!(ambiguous[1].console.lines.is_empty());
    std::fs::remove_file(&log).unwrap();
    refresh_console(&mut ambiguous, &log);
    assert!(ambiguous.iter().all(|check| check.console.error.is_some()));
    assert!(
      checks
        .iter()
        .any(|check| matches!(check.status, HudCheckStatus::NoBaseline))
    );
    assert!(
      checks
        .iter()
        .any(|check| matches!(check.status, HudCheckStatus::Unsupported))
    );
  }
  #[test]
  fn malformed_layout_is_not_reported_as_clean() {
    assert!(panel_ids(b"not a compiled layout").is_err());
    assert!(collect_ids(&Kv3Value::Object(vec![])).is_err());
    let mut bytes = layout(&["Hud"]);
    assert!(panel_ids(&bytes[..bytes.len() / 2]).is_err());
    bytes[16..20].copy_from_slice(b"DATA");
    assert!(panel_ids(&bytes).is_err());
    bytes[16..20].copy_from_slice(b"LaCo");
    bytes[32..36].fill(0);
    assert!(panel_ids(&bytes).is_err());
  }
  #[test]
  fn logs_are_bounded_and_missing_logs_are_explicit() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("console.log");
    assert!(read_console(&path).error.is_some());
    std::fs::write(
      &path,
      format!(
        "{}\nUnable to find child 'Hud'\n",
        "x".repeat(LOG_LIMIT as usize)
      ),
    )
    .unwrap();
    let evidence = read_console(&path);
    assert!(evidence.truncated);
    assert!(evidence.modified_at.is_some());
    assert_eq!(evidence.lines, vec!["Unable to find child 'Hud'"]);
  }
}
