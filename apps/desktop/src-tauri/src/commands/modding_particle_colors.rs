use super::{
  modding_edits::{self, Edit},
  modding_source::{self, Field},
  modding_workspace::{contained, relative, resolve},
};
use crate::{app_runtime::AppHandle, errors::Error};
use serde::{Deserialize, Serialize};
use std::{
  collections::{BTreeMap, BTreeSet},
  path::Path,
};
use ts_rs::TS;

#[derive(Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ModdingParticleColor {
  pub path: String,
  pub rgb: [u8; 3],
  pub alpha: Option<f64>,
  pub normalized: bool,
}
#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ModdingParticleFile {
  pub path: String,
  pub text: String,
  pub fingerprint: String,
  pub colors: Vec<ModdingParticleColor>,
  pub diagnostic: Option<String>,
}
#[derive(Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ModdingParticleColorChange {
  pub path: String,
  pub rgb: [u8; 3],
}
#[derive(Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ModdingParticleTextReplace {
  pub find: String,
  pub replacement: String,
  pub regex: bool,
}
#[derive(Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ModdingParticleColorEdit {
  pub path: String,
  pub text: String,
  pub changes: Vec<ModdingParticleColorChange>,
  #[serde(default)]
  #[ts(optional)]
  pub replace: Option<ModdingParticleTextReplace>,
}
#[derive(Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ModdingParticleSave {
  pub path: String,
  pub text: String,
  pub fingerprint: String,
}
struct Color {
  value: ModdingParticleColor,
  channels: Vec<Field>,
}

fn colors(text: &str) -> Result<Vec<Color>, Error> {
  let fields = modding_source::fields(text)?;
  let classes: BTreeMap<_, _> = fields
    .iter()
    .filter(|field| field.name == "_class")
    .map(|field| {
      (
        field
          .path
          .rsplit_once('/')
          .map(|(parent, _)| parent)
          .unwrap_or(""),
        text[field.start..field.end].to_ascii_lowercase(),
      )
    })
    .collect();
  let mut arrays: BTreeMap<String, Vec<(usize, Field)>> = BTreeMap::new();
  for field in &fields {
    if let Some((parent, index)) = field.path.rsplit_once('[')
      && let Some(index) = index
        .strip_suffix(']')
        .and_then(|index| index.parse::<usize>().ok())
    {
      arrays
        .entry(parent.to_owned())
        .or_default()
        .push((index, field.clone()));
    }
  }
  let mut result = Vec::new();
  for (path, mut channels) in arrays {
    let name = path
      .rsplit('/')
      .next()
      .unwrap_or(&path)
      .to_ascii_lowercase();
    let parent = path
      .rsplit_once('/')
      .map(|(parent, _)| parent)
      .unwrap_or("");
    let color_operator = classes
      .get(parent)
      .is_some_and(|class| class.contains("color"));
    if !name.contains("color")
      && !name.contains("tint")
      && !(color_operator && ["m_vecoutputmin", "m_vecoutputmax"].contains(&name.as_str()))
    {
      continue;
    }
    channels.sort_by_key(|(index, _)| *index);
    if !(3..=4).contains(&channels.len())
      || channels
        .iter()
        .enumerate()
        .any(|(index, (actual, _))| index != *actual)
    {
      continue;
    }
    let values: Option<Vec<f64>> = channels
      .iter()
      .map(|(_, field)| text[field.start..field.end].trim().parse::<f64>().ok())
      .collect();
    let Some(values) = values else {
      continue;
    };
    if values
      .iter()
      .any(|value| !value.is_finite() || !(0.0..=255.0).contains(value))
    {
      continue;
    }
    let normalized = values[..3].iter().all(|value| *value <= 1.0)
      && channels[..3]
        .iter()
        .any(|(_, field)| text[field.start..field.end].contains(['.', 'e', 'E']));
    let scale = if normalized { 255.0 } else { 1.0 };
    result.push(Color {
      value: ModdingParticleColor {
        path,
        rgb: std::array::from_fn(|index| (values[index] * scale).round() as u8),
        alpha: values.get(3).copied(),
        normalized,
      },
      channels: channels.into_iter().map(|(_, field)| field).collect(),
    });
  }
  Ok(result)
}
fn document(path: String, text: String) -> ModdingParticleFile {
  let parsed = colors(&text);
  let diagnostic = parsed.as_ref().err().map(ToString::to_string);
  ModdingParticleFile {
    path,
    fingerprint: modding_edits::fingerprint(text.as_bytes()),
    text,
    colors: parsed
      .unwrap_or_default()
      .into_iter()
      .map(|color| color.value)
      .collect(),
    diagnostic,
  }
}
fn edit(text: &str, changes: &[ModdingParticleColorChange]) -> Result<String, Error> {
  let parsed = colors(text)?;
  let mut seen = BTreeSet::new();
  let mut replacements = Vec::new();
  for change in changes {
    if !seen.insert(&change.path) {
      return Err(Error::InvalidInput(
        "Duplicate particle color target".into(),
      ));
    }
    let color = parsed
      .iter()
      .find(|color| color.value.path == change.path)
      .ok_or_else(|| {
        Error::InvalidInput(format!(
          "Color field is missing or ambiguous: {}",
          change.path
        ))
      })?;
    for (index, channel) in change.rgb.iter().enumerate() {
      let value = if color.value.normalized {
        format!("{:.6}", f64::from(*channel) / 255.0)
      } else {
        channel.to_string()
      };
      replacements.push((
        color.channels[index].start,
        color.channels[index].end,
        value,
      ));
    }
  }
  replacements.sort_by_key(|(start, _, _)| std::cmp::Reverse(*start));
  let mut result = text.to_owned();
  for (start, end, value) in replacements {
    result.replace_range(start..end, &value);
  }
  modding_source::fields(&result)?;
  Ok(result)
}
fn particle_path(path: &str) -> Result<(), Error> {
  relative(path, false)?;
  if !Path::new(path)
    .extension()
    .is_some_and(|extension| extension.eq_ignore_ascii_case("vpcf"))
  {
    return Err(Error::InvalidInput(
      "Select an editable .vpcf source file".into(),
    ));
  }
  Ok(())
}
fn load(root: &Path, scope: &str) -> Result<Vec<ModdingParticleFile>, Error> {
  relative(scope, true)?;
  let mut bytes = 0;
  let mut result = Vec::new();
  for path in super::modding_batch::files(root)? {
    if particle_path(&path).is_err()
      || !(scope.is_empty() || path == scope || path.starts_with(&format!("{scope}/")))
    {
      continue;
    }
    let file = contained(root, &path)?;
    let size = std::fs::metadata(&file)?.len();
    bytes += size;
    if size > 4 * 1024 * 1024 || bytes > 64 * 1024 * 1024 || result.len() >= 8192 {
      return Err(Error::InvalidInput("Particle editing is limited to 8192 files, 4 MB per file and 64 MB total; choose a smaller folder".into()));
    }
    result.push(document(path, std::fs::read_to_string(file)?));
  }
  Ok(result)
}
fn save(root: &Path, files: Vec<ModdingParticleSave>) -> Result<String, Error> {
  if files.is_empty()
    || files.len() > 8192
    || files.iter().map(|file| file.text.len()).sum::<usize>() > 64 * 1024 * 1024
  {
    return Err(Error::InvalidInput(
      "Select 1–8192 particle files, up to 64 MB total".into(),
    ));
  }
  let mut edits = Vec::new();
  for file in files {
    particle_path(&file.path)?;
    if file.text.len() > 4 * 1024 * 1024 {
      return Err(Error::InvalidInput("Particle source exceeds 4 MB".into()));
    }
    modding_source::fields(&file.text)?;
    let current = std::fs::read(contained(root, &file.path)?)?;
    if modding_edits::fingerprint(&current) != file.fingerprint {
      return Err(Error::InvalidInput(format!(
        "{} changed on disk. Reopen the editor to preserve newer edits.",
        file.path
      )));
    }
    if current != file.text.as_bytes() {
      edits.push(Edit {
        from: file.path.clone(),
        to: file.path,
        bytes: file.text.into_bytes(),
      });
    }
  }
  modding_edits::commit(root, edits)
}
#[tauri::command]
pub async fn list_modding_particle_colors(
  app: AppHandle,
  addon_id: String,
  scope: String,
) -> Result<Vec<ModdingParticleFile>, Error> {
  let root = resolve(&app, &addon_id)?.content_path;
  tauri::async_runtime::spawn_blocking(move || load(Path::new(&root), &scope))
    .await
    .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}
#[tauri::command]
pub async fn edit_modding_particle_colors(
  files: Vec<ModdingParticleColorEdit>,
) -> Result<Vec<ModdingParticleFile>, Error> {
  if files.len() > 8192
    || files.iter().map(|file| file.text.len()).sum::<usize>() > 64 * 1024 * 1024
    || files
      .iter()
      .any(|file| file.text.len() > 4 * 1024 * 1024 || file.changes.len() > 100_000)
  {
    return Err(Error::InvalidInput(
      "Particle edit exceeds file or size limits".into(),
    ));
  }
  tauri::async_runtime::spawn_blocking(move || {
    files
      .into_iter()
      .map(|file| {
        particle_path(&file.path)?;
        let mut text = file.text;
        if let Some(replace) = file.replace {
          if replace.find.is_empty()
            || replace.find.len() > 8192
            || replace.replacement.len() > 1024 * 1024
          {
            return Err(Error::InvalidInput(
              "Enter a search pattern up to 8192 characters and a replacement up to 1 MB".into(),
            ));
          }
          let pattern = if replace.regex {
            replace.find
          } else {
            regex::escape(&replace.find)
          };
          let pattern =
            regex::Regex::new(&pattern).map_err(|error| Error::InvalidInput(error.to_string()))?;
          text = if replace.regex {
            pattern
              .replace_all(&text, replace.replacement.as_str())
              .into_owned()
          } else {
            pattern
              .replace_all(&text, regex::NoExpand(&replace.replacement))
              .into_owned()
          };
          if text.len() > 4 * 1024 * 1024 {
            return Err(Error::InvalidInput(
              "Replacement source exceeds 4 MB".into(),
            ));
          }
        }
        if !file.changes.is_empty() {
          text = edit(&text, &file.changes)?;
        }
        Ok(document(file.path, text))
      })
      .collect()
  })
  .await
  .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}
#[tauri::command]
pub async fn save_modding_particle_files(
  app: AppHandle,
  addon_id: String,
  files: Vec<ModdingParticleSave>,
) -> Result<String, Error> {
  let root = resolve(&app, &addon_id)?.content_path;
  tauri::async_runtime::spawn_blocking(move || {
    let _guard = modding_edits::EDIT_LOCK
      .lock()
      .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?;
    save(Path::new(&root), files)
  })
  .await
  .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}

#[cfg(test)]
mod tests {
  use super::*;
  fn change(path: &str, rgb: [u8; 3]) -> ModdingParticleColorChange {
    ModdingParticleColorChange {
      path: path.into(),
      rgb,
    }
  }
  #[test]
  fn colors_include_black_and_gradients_but_exclude_positions_and_comments() {
    let text = r#"{ m_ConstantColor = [0,0,0,255] m_Position=[1,2,3] // m_Color1=[9,9,9]
 m_Gradient={ m_Stops=[{ m_flPosition=0.5 m_Color=[255,100,0,123] }] } m_Unknown="m_Color2=[1,2,3]" }"#;
    let fields = colors(text).unwrap();
    assert_eq!(fields.len(), 2);
    let changed = edit(
      text,
      &[
        change("m_ConstantColor", [10, 20, 30]),
        change("m_Gradient/m_Stops[0]/m_Color", [3, 4, 5]),
      ],
    )
    .unwrap();
    assert!(changed.contains("[10,20,30,255]"));
    assert!(changed.contains("m_Color=[3,4,5,123]"));
    assert!(changed.contains("m_Position=[1,2,3]"));
    assert!(changed.contains("// m_Color1=[9,9,9]"));
  }
  #[test]
  fn normalized_colors_and_repeated_fields_are_addressed_without_changing_alpha() {
    let text = "{ m_Initializers=[{m_Color1=[0.5,0.25,0.75,0.6]},{m_Color1=[9,8,7,6]}] }";
    assert!(colors(text).unwrap()[0].value.normalized);
    let changed = edit(text, &[change("m_Initializers[0]/m_Color1", [255, 0, 128])]).unwrap();
    assert!(changed.contains("[1.000000,0.000000,0.501961,0.6]"));
    assert!(changed.contains("[9,8,7,6]"));
  }
  #[test]
  fn byte_order_marks_and_utf8_comments_survive_color_edits() {
    let text = "\u{feff}// café\n{m_Color1=[255,128,0,12]}";
    let changed = edit(text, &[change("m_Color1", [0, 1, 2])]).unwrap();
    assert_eq!(changed, "\u{feff}// café\n{m_Color1=[0,1,2,12]}");
  }
  #[test]
  fn batch_saves_reject_stale_files_before_writing_and_backups_restore_every_file() {
    let root = tempfile::tempdir().unwrap();
    for name in ["one.vpcf", "two.vpcf"] {
      std::fs::write(root.path().join(name), "{m_Color1=[1,2,3]}").unwrap();
    }
    let files = load(root.path(), "").unwrap();
    let requests = || {
      files
        .iter()
        .map(|file| ModdingParticleSave {
          path: file.path.clone(),
          fingerprint: file.fingerprint.clone(),
          text: "{m_Color1=[4,5,6]}".into(),
        })
        .collect()
    };
    std::fs::write(root.path().join("two.vpcf"), "newer").unwrap();
    assert!(save(root.path(), requests()).is_err());
    assert_eq!(
      std::fs::read_to_string(root.path().join("one.vpcf")).unwrap(),
      "{m_Color1=[1,2,3]}"
    );
    std::fs::write(root.path().join("two.vpcf"), "{m_Color1=[1,2,3]}").unwrap();
    let backup = save(root.path(), requests()).unwrap();
    modding_edits::undo(root.path(), &backup).unwrap();
    for name in ["one.vpcf", "two.vpcf"] {
      assert_eq!(
        std::fs::read_to_string(root.path().join(name)).unwrap(),
        "{m_Color1=[1,2,3]}"
      );
    }
  }
}
