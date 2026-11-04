use super::fingerprint::addon_path_fingerprint;
use super::types::{CrashSuspect, SessionFingerprint};
use crate::mod_manager::vpk_manager::VpkManager;
use crate::mod_manager::vpk_manifest::ProfileVpkManifest;
use regex::Regex;
use std::path::{Component, Path};
use std::sync::LazyLock;
use vpk_parser::VpkParser;

static RESOURCE: LazyLock<Regex> = LazyLock::new(|| {
  Regex::new(r"(?i)\b(?:panorama|scripts|models|materials|particles|soundevents|sounds)/[a-z0-9_./-]+\.(?:vxml_c|vcss_c|vdata_c|vdata|vmdl_c|vmat_c|vpcf_c|vsnd_c)\b").unwrap()
});

static PANORAMA_SOURCE: LazyLock<Regex> =
  LazyLock::new(|| Regex::new(r"file://\{resources\}/([a-z0-9_./-]+)\.(xml|css)\b").unwrap());

fn resource_paths(message: &str) -> Vec<String> {
  let message = message.replace('\\', "/").to_ascii_lowercase();
  // Panorama names sources through its {resources} alias; the VPK stores them
  // compiled under panorama/.
  let message = PANORAMA_SOURCE.replace_all(&message, |found: &regex::Captures| {
    let extension = if &found[2] == "xml" {
      "vxml_c"
    } else {
      "vcss_c"
    };
    format!("panorama/{}.{extension}", &found[1])
  });
  let mut paths = Vec::new();
  for found in RESOURCE.find_iter(&message) {
    let path = found.as_str();
    // A word boundary still matches before `.` or `-`, so `x.vmat_c.bak` would name the wrong file.
    let suffixed = message[found.end()..]
      .chars()
      .next()
      .is_some_and(|next| next.is_ascii_alphanumeric() || matches!(next, '_' | '.' | '-'));
    // A resource root inside a longer path would attribute a truncated suffix.
    let prefixed = message[..found.start()]
      .chars()
      .next_back()
      .is_some_and(|previous| {
        previous.is_ascii_alphanumeric() || matches!(previous, '/' | '_' | '.' | '-')
      });
    if suffixed || prefixed || path.split('/').any(|part| part == ".." || part == ".") {
      continue;
    }
    // Fatal errors can name the source vdata while the VPK stores the compiled resource.
    let path = if path.ends_with(".vdata") {
      format!("{path}_c")
    } else {
      path.to_string()
    };
    if !paths.contains(&path) {
      paths.push(path);
    }
  }
  paths
}

pub(super) fn find_suspect(
  game_path: &Path,
  fingerprint: &SessionFingerprint,
  abort_message: &str,
) -> Option<CrashSuspect> {
  let mut suspect: Option<(String, CrashSuspect)> = None;
  for resource in resource_paths(abort_message) {
    let Some((mounted, found)) = resource_owner(game_path, fingerprint, &resource) else {
      continue;
    };
    if let Some((previous_mounted, previous)) = &suspect {
      if previous.mod_id != found.mod_id
        || previous.vpk != found.vpk
        || *previous_mounted != mounted
      {
        return None;
      }
    } else {
      suspect = Some((mounted, found));
    }
  }
  suspect.map(|(_, found)| found)
}

fn resource_owner(
  game_path: &Path,
  fingerprint: &SessionFingerprint,
  resource: &str,
) -> Option<(String, CrashSuspect)> {
  for mounted in &fingerprint.addon_paths {
    if !mounted.path.starts_with("citadel/addons")
      || Path::new(&mounted.path)
        .components()
        .any(|part| !matches!(part, Component::Normal(_)))
    {
      return None;
    }
    // Recovered reports must not blame a mod installed after the session.
    if addon_path_fingerprint(game_path, &mounted.path) != *mounted {
      return None;
    }
    let directory = game_path.join("game").join(&mounted.path);
    let entries = std::fs::read_dir(&directory)
      .ok()?
      .collect::<Result<Vec<_>, _>>()
      .ok()?;
    let mut vpks = entries
      .into_iter()
      .filter_map(|entry| {
        let name = entry.file_name().to_str()?.to_string();
        Some((VpkManager::enabled_vpk_number(&name)?, name, entry.path()))
      })
      .collect::<Vec<_>>();
    vpks.sort_by_key(|(number, _, _)| *number);
    for (_, name, path) in vpks {
      let entries = VpkParser::parse_directory_from_file(&path).ok()?;
      if !entries.iter().any(|entry| {
        entry
          .full_path
          .replace('\\', "/")
          .eq_ignore_ascii_case(resource)
      }) {
        continue;
      }
      let relative = mounted.path.strip_prefix("citadel/")?;
      let profile = relative.split_once('/').map_or("", |(_, profile)| profile);
      let base = game_path.join("game/citadel/addons").join(profile);
      let manifest = ProfileVpkManifest::load(&base).ok()?;
      let root = relative.split('/').next()?;
      let shard = if root == "addons" {
        1
      } else {
        root.strip_prefix("addons")?.parse().ok()?
      };
      let owners = manifest
        .mods
        .iter()
        .filter(|(_, entry)| {
          entry.enabled && entry.shard.get() == shard && entry.current_vpks.contains(&name)
        })
        .collect::<Vec<_>>();
      if owners.len() > 1 {
        return None;
      }
      let mod_id = owners.first().and_then(|(id, _)| {
        fingerprint
          .client
          .as_ref()?
          .mods
          .iter()
          .find(|item| &item.remote_id == *id)
          .map(|item| item.remote_id.clone())
      });
      let mod_name = mod_id
        .as_ref()
        .and_then(|id| {
          fingerprint
            .client
            .as_ref()?
            .mods
            .iter()
            .find(|item| &item.remote_id == id)
        })
        .map(|item| item.name.clone());
      return Some((
        mounted.path.clone(),
        CrashSuspect {
          resource_path: resource.to_string(),
          vpk: name,
          mod_id,
          mod_name,
        },
      ));
    }
  }
  None
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::game_session::fingerprint::capture;
  use crate::game_session::types::{ClientFingerprint, ClientModRef};
  use crate::mod_manager::shard::ShardIndex;
  #[test]
  fn generic_access_violations_name_no_resources() {
    assert!(resource_paths("EXCEPTION_ACCESS_VIOLATION reading address 0x0").is_empty());
    assert_eq!(
      resource_paths(r"Fatal error: 'Scripts\Test.vdata'"),
      ["scripts/test.vdata_c"]
    );
    assert!(resource_paths("Couldn't load scripts/../secrets.vdata_c").is_empty());
    assert!(resource_paths("Couldn't load materials/test.vmat_c.bak").is_empty());
    assert!(resource_paths("Couldn't load ../materials/hud.vmat_c").is_empty());
    assert_eq!(
      resource_paths(
        "FATAL ERROR: Unable to load layout file 'file://{resources}/layout/hud.xml'.  This may indicate a problem with your local install files"
      ),
      ["panorama/layout/hud.vxml_c"]
    );
    assert_eq!(
      resource_paths("Failed to load file://{resources}/styles/hud.css"),
      ["panorama/styles/hud.vcss_c"]
    );
    assert!(resource_paths("Failed to load file://{resources}/../hud.xml").is_empty());
  }
  fn write_vpk(dir: &Path, name: &str, resource: &str, contents: &str) {
    let source = tempfile::tempdir().unwrap();
    let target = source.path().join(resource);
    std::fs::create_dir_all(target.parent().unwrap()).unwrap();
    std::fs::write(&target, contents).unwrap();
    vpkmanager::pack_directory(source.path(), &dir.join(name)).unwrap();
  }
  #[test]
  fn rejects_resource_roots_embedded_in_other_paths() {
    for prefix in ["foo/", "/", "c:/", "./", "../", "foo\\", "-"] {
      assert!(resource_paths(&format!("Failed: {prefix}materials/hud.vmat_c")).is_empty());
    }
    assert_eq!(
      resource_paths("Failed: 'materials/hud.vmat_c'"),
      ["materials/hud.vmat_c"]
    );
  }
  #[test]
  fn resolves_the_winning_mounted_vpk_and_refuses_changed_files() {
    let game = tempfile::tempdir().unwrap();
    let data = tempfile::tempdir().unwrap();
    let directory = game.path().join("game/citadel/addons/profile_default");
    std::fs::create_dir_all(&directory).unwrap();
    std::fs::write(
      game.path().join("game/citadel/gameinfo.gi"),
      "Game citadel/addons/profile_default\n",
    )
    .unwrap();
    let resource = "panorama/layout/hud.vxml_c";
    write_vpk(&directory, "pak01_dir.vpk", resource, "winner");
    write_vpk(&directory, "pak02_dir.vpk", resource, "loser");
    write_vpk(&directory, "3_pak03_dir.vpk", resource, "disabled");
    let mut manifest = ProfileVpkManifest::default();
    for (id, vpk) in [("1", "pak01_dir.vpk"), ("2", "pak02_dir.vpk")] {
      manifest.mark_enabled(id, vec![vpk.to_string()], vec![], None, ShardIndex::FIRST);
    }
    manifest.save(&directory).unwrap();
    let mut fingerprint = capture(game.path(), data.path(), &[]);
    fingerprint.client = Some(ClientFingerprint {
      profile_id: "default".into(),
      profile_name: "Default".into(),
      mods: vec![ClientModRef {
        remote_id: "1".into(),
        name: "HUD".into(),
        downloaded_at: None,
        variant: None,
        enabled_at: None,
      }],
    });
    let found = find_suspect(
      game.path(),
      &fingerprint,
      "Unable to load panorama/layout/hud.vxml_c",
    )
    .unwrap();
    assert_eq!(found.mod_id.as_deref(), Some("1"));
    assert_eq!(found.mod_name.as_deref(), Some("HUD"));
    assert!(find_suspect(game.path(), &fingerprint, "Access violation").is_none());
    write_vpk(
      &directory,
      "pak01_dir.vpk",
      resource,
      "changed after the crash",
    );
    assert!(
      find_suspect(
        game.path(),
        &fingerprint,
        "Unable to load panorama/layout/hud.vxml_c"
      )
      .is_none()
    );
  }
  #[test]
  fn follows_mounted_search_path_order_across_shards() {
    let game = tempfile::tempdir().unwrap();
    let data = tempfile::tempdir().unwrap();
    let base = game.path().join("game/citadel/addons/profile_default");
    let later = game.path().join("game/citadel/addons2/profile_default");
    std::fs::create_dir_all(&base).unwrap();
    std::fs::create_dir_all(&later).unwrap();
    std::fs::write(
      game.path().join("game/citadel/gameinfo.gi"),
      "Game citadel/addons/profile_default\nGame citadel/addons2/profile_default\n",
    )
    .unwrap();
    let resource = "scripts/heroes/test.vdata_c";
    write_vpk(&base, "pak40_dir.vpk", resource, "first shard");
    write_vpk(&later, "pak01_dir.vpk", resource, "second shard");
    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_enabled(
      "1",
      vec!["pak40_dir.vpk".into()],
      vec![],
      None,
      ShardIndex::FIRST,
    );
    manifest.mark_enabled(
      "2",
      vec!["pak01_dir.vpk".into()],
      vec![],
      None,
      ShardIndex::new(2).unwrap(),
    );
    manifest.save(&base).unwrap();
    let mut fingerprint = capture(game.path(), data.path(), &[]);
    let message = "Fatal error loading scripts/heroes/test.vdata_c";
    assert_eq!(
      find_suspect(game.path(), &fingerprint, message)
        .unwrap()
        .vpk,
      "pak40_dir.vpk"
    );
    fingerprint.addon_paths.reverse();
    assert_eq!(
      find_suspect(game.path(), &fingerprint, message)
        .unwrap()
        .vpk,
      "pak01_dir.vpk"
    );
  }
}
