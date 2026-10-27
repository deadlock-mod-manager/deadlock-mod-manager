use crate::app_runtime::AppHandle;
use crate::errors::Error;
use serde::Serialize;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tauri::Manager;
use ts_rs::TS;

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingBuildResult {
  pub mod_id: String,
  pub addon_id: String,
  pub output_path: String,
  pub file_count: usize,
  pub log_path: String,
}

pub(super) fn pack_files(root: &Path, output: &Path) -> Result<(), Error> {
  copy_assets(root, output, true)
}

fn copy_assets(root: &Path, output: &Path, top_level: bool) -> Result<(), Error> {
  for entry in std::fs::read_dir(root)? {
    let entry = entry?;
    let name = entry.file_name();
    let text = name.to_string_lossy();
    if text.starts_with('.')
      || (top_level
        && ["tools", "addoninfo.txt", "toolscenelightrigs.vdata_c"].contains(&text.as_ref()))
    {
      continue;
    }
    let kind = entry.file_type()?;
    if kind.is_dir() {
      std::fs::create_dir_all(output.join(&name))?;
      copy_assets(&entry.path(), &output.join(name), false)?;
    } else if kind.is_file() {
      std::fs::copy(entry.path(), output.join(name))?;
    }
  }
  Ok(())
}

pub(super) static BUILD_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn compiler_extensions(text: &str) -> std::collections::BTreeSet<String> {
  let mut extensions = std::collections::BTreeSet::new();
  let mut objects: Vec<(Vec<String>, bool)> = Vec::new();
  let mut chars = text.chars().peekable();
  let mut property = None;
  let mut additional = false;
  while let Some(ch) = chars.next() {
    let token = match ch {
      '/' if chars.peek() == Some(&'/') => {
        for ch in chars.by_ref() {
          if ch == '\n' {
            break;
          }
        }
        continue;
      }
      '{' => {
        objects.push((Vec::new(), false));
        property = None;
        continue;
      }
      '}' => {
        if let Some((object_extensions, true)) = objects.pop() {
          extensions.extend(object_extensions);
        }
        property = None;
        continue;
      }
      ']' => {
        additional = false;
        continue;
      }
      '"' => {
        let mut value = String::new();
        while let Some(ch) = chars.next() {
          if ch == '"' {
            break;
          }
          if ch == '\\' {
            if let Some(escaped) = chars.next() {
              value.push(escaped);
            }
          } else {
            value.push(ch);
          }
        }
        value
      }
      ch if ch.is_ascii_alphabetic() || ch == '_' => {
        let mut value = String::from(ch);
        while chars
          .peek()
          .is_some_and(|ch| ch.is_ascii_alphanumeric() || *ch == '_')
        {
          value.push(chars.next().unwrap());
        }
        value
      }
      _ => continue,
    };
    if token == "m_AdditionalExtensions" {
      additional = true;
      continue;
    }
    if additional {
      if let Some(object) = objects.last_mut() {
        object.0.push(token);
      }
      continue;
    }
    if let Some(field) = property.take() {
      if let Some(object) = objects.last_mut() {
        if field == "m_Ext" {
          object.0.push(token);
        } else {
          object.1 = !token.is_empty();
        }
      }
    } else if token == "m_Ext" || token == "m_CompilerIdentifier" {
      property = Some(token);
    }
  }
  extensions
}

fn source_files(
  root: &Path,
  extensions: &std::collections::BTreeSet<String>,
) -> Result<Vec<PathBuf>, Error> {
  let mut files = Vec::new();
  let mut pending = vec![root.to_path_buf()];
  while let Some(directory) = pending.pop() {
    for entry in std::fs::read_dir(directory)? {
      let entry = entry?;
      if entry.file_name().to_string_lossy().starts_with('.') {
        continue;
      }
      let kind = entry.file_type()?;
      if kind.is_dir() {
        pending.push(entry.path());
      } else if kind.is_file() && compiler_source(&entry.path(), extensions) {
        files.push(entry.path());
      }
    }
  }
  files.sort();
  Ok(files)
}

fn compiler_source(path: &Path, extensions: &std::collections::BTreeSet<String>) -> bool {
  !path
    .file_name()
    .is_some_and(|name| name.to_string_lossy().contains('+'))
    && path
      .extension()
      .and_then(|ext| ext.to_str())
      .is_some_and(|ext| extensions.contains(&ext.to_ascii_lowercase()))
}

fn selected_sources(root: &Path, paths: Vec<String>) -> Result<Vec<PathBuf>, Error> {
  if paths.is_empty() {
    return Err(Error::InvalidInput(
      "Select at least one source file to compile".into(),
    ));
  }
  paths
    .into_iter()
    .map(|path| {
      let file = super::modding_workspace::contained(root, &path)?;
      if !file.is_file() {
        return Err(Error::InvalidInput(format!(
          "Compiler input is not a source file: {path}"
        )));
      }
      Ok(file)
    })
    .collect()
}

pub(super) fn compile(
  addon: &super::modding_workspace::ModdingAddon,
  config: super::modding_tools::ModdingToolsConfig,
  tools: &Path,
  steam: Option<PathBuf>,
  log_path: &Path,
  selected: Option<Vec<PathBuf>>,
) -> Result<(), Error> {
  super::modding_housekeeping::normalize_particles(Path::new(&addon.content_path))?;
  let image_compilers = super::modding_image_compiler::sync(Path::new(&addon.content_path))?;
  let sdk = PathBuf::from(config.prepared_sdk);
  let alias = super::modding_workspace::mount(addon, &sdk)?;
  let runtime = steam.map(|steam_root| source2_tools::ProtonRuntime {
    launcher: if config.proton.is_empty() {
      steam_root.join("steamapps/common/Proton - Experimental/proton")
    } else {
      config.proton.into()
    },
    steam_root,
    prefix: tools.join("csdk12-compiler-prefix"),
  });
  if let Some(runtime) = &runtime {
    std::fs::create_dir_all(&runtime.prefix)?;
  }
  let mut extensions = std::collections::BTreeSet::new();
  for metadata in ["assettypes_common.txt", "assettypes_internal.txt"] {
    extensions.extend(compiler_extensions(&std::fs::read_to_string(
      sdk.join("game/bin").join(metadata),
    )?));
  }
  let mut inputs = match selected {
    Some(inputs) => inputs
      .into_iter()
      .chain(image_compilers)
      .map(|input| {
        if !compiler_source(&input, &extensions) {
          return Err(Error::InvalidInput(format!(
            "This file cannot be compiled directly: {}. Compile its parent resource for generated '+' files.",
            input.display()
          )));
        }
        let relative = input.strip_prefix(&addon.content_path).map_err(|_| {
          Error::InvalidInput("Compiler input is outside the selected addon".into())
        })?;
        Ok(
          sdk
            .join("content/citadel_addons")
            .join(&alias)
            .join(relative),
        )
      })
      .collect::<Result<Vec<_>, Error>>()?,
    None => source_files(
      &sdk.join("content/citadel_addons").join(&alias),
      &extensions,
    )?,
  };
  inputs.sort();
  inputs.dedup();
  if inputs.is_empty() {
    return Err(Error::InvalidInput(
      "This addon has no compilable source resources".into(),
    ));
  }
  let mut file_list = tempfile::NamedTempFile::new()?;
  for input in inputs {
    let path = input.to_string_lossy();
    if path.contains(['\n', '\r']) {
      return Err(Error::InvalidInput(
        "Source paths cannot contain newlines".into(),
      ));
    }
    writeln!(
      file_list,
      "{}",
      if cfg!(windows) {
        path.into_owned()
      } else {
        format!("Z:{}", path.replace('/', "\\"))
      }
    )?;
  }
  file_list.flush()?;
  let log = std::fs::File::create(log_path)?;
  let status = source2_tools::compiler_command(&sdk, &alias, file_list.path(), runtime.as_ref())
    .map_err(|e| Error::InvalidInput(e.to_string()))?
    .stdin(Stdio::null())
    .stdout(log.try_clone()?)
    .stderr(log)
    .status()?;
  let compilation = std::fs::read_to_string(log_path)?;
  if !status.success() || super::modding_compile_log::failed(&compilation) {
    let details = super::modding_compile_log::failure_details(&compilation);
    return Err(Error::InvalidInput(format!(
      "Addon compilation failed ({status}). {details}\nSee {}",
      log_path.display()
    )));
  }
  Ok(())
}

#[tauri::command]
pub async fn compile_modding_addon(
  app: AppHandle,
  addon_id: String,
  paths: Option<Vec<String>>,
) -> Result<String, Error> {
  let addon = super::modding_workspace::resolve(&app, &addon_id)?;
  let config = super::modding_tools::get_modding_tools_config(app.clone())?;
  let tools = app.path().app_data_dir()?.join("tools");
  let steam = super::state::MANAGER
    .lock()
    .map_err(|e| Error::BackgroundTaskFailed(e.to_string()))?
    .get_steam_manager()
    .get_steam_path();
  tauri::async_runtime::spawn_blocking(move || {
    let _guard = BUILD_LOCK
      .lock()
      .map_err(|e| Error::BackgroundTaskFailed(e.to_string()))?;
    std::fs::create_dir_all(&tools)?;
    let log = tools.join(format!("compile-{}.log", addon.id));
    let selected = paths
      .map(|paths| selected_sources(Path::new(&addon.content_path), paths))
      .transpose()?;
    compile(&addon, config, &tools, steam, &log, selected)?;
    Ok(log.to_string_lossy().into_owned())
  })
  .await
  .map_err(|e| Error::BackgroundTaskFailed(e.to_string()))?
}

#[tauri::command]
pub async fn build_modding_addon(
  app: AppHandle,
  addon_id: String,
) -> Result<ModdingBuildResult, Error> {
  let addon = super::modding_workspace::resolve(&app, &addon_id)?;
  let config = super::modding_tools::get_modding_tools_config(app.clone())?;
  let tools = app.path().app_data_dir()?.join("tools");
  let (steam, store) = {
    let manager = super::state::MANAGER
      .lock()
      .map_err(|e| Error::BackgroundTaskFailed(e.to_string()))?;
    (
      manager.get_steam_manager().get_steam_path(),
      manager.get_mods_store_path()?,
    )
  };
  tauri::async_runtime::spawn_blocking(move || {
    let _guard = BUILD_LOCK.lock().map_err(|e| Error::BackgroundTaskFailed(e.to_string()))?;
    let mod_id = format!("local-workbench-{}", &addon.id[..32]);
    let mod_dir = store.join(&mod_id);
    std::fs::create_dir_all(&mod_dir)?;
    let log_path = mod_dir.join("compile.log");
    compile(&addon, config, &tools, steam, &log_path, None)?;
    let staging = tempfile::tempdir_in(&mod_dir)?;
    let files = staging.path().join("files");
    std::fs::create_dir(&files)?;
    pack_files(Path::new(&addon.game_path), &files)?;
    let packed = staging.path().join("addon_dir.vpk");
    let file_count = vpkmanager::pack_directory(&files, &packed).map_err(|e| Error::InvalidInput(e.to_string()))?;
    let final_files = mod_dir.join("files");
    std::fs::create_dir_all(&final_files)?;
    let output = final_files.join("addon_dir.vpk");
    let mut temporary = tempfile::NamedTempFile::new_in(&final_files)?;
    std::io::copy(&mut std::fs::File::open(packed)?, &mut temporary)?;
    temporary.flush()?;
    temporary.persist(&output).map_err(|e| e.error)?;
    let metadata = serde_json::json!({"id":mod_id,"kind":"local","name":addon.name,"author":"Modding Workbench","category":"Skins","description":"Built from a CSDK12 addon.","createdAt":chrono::Utc::now().to_rfc3339(),"_schema":1});
    std::fs::write(mod_dir.join("metadata.json"), serde_json::to_vec_pretty(&metadata).map_err(|e| Error::InvalidInput(e.to_string()))?)?;
    Ok(ModdingBuildResult { mod_id, addon_id, output_path: output.to_string_lossy().into_owned(), file_count, log_path: log_path.to_string_lossy().into_owned() })
  }).await.map_err(|e| Error::BackgroundTaskFailed(e.to_string()))?
}

#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn selected_model_compilation_excludes_unrelated_project_sources() {
    let root = tempfile::tempdir().unwrap();
    std::fs::create_dir(root.path().join("models")).unwrap();
    std::fs::create_dir(root.path().join("maps")).unwrap();
    for file in [
      "models/current.vmdl",
      "models/old_broken.vmdl",
      "maps/broken.vmap",
    ] {
      std::fs::write(root.path().join(file), b"fixture").unwrap();
    }
    assert_eq!(
      selected_sources(root.path(), vec!["models/current.vmdl".into()]).unwrap(),
      [root.path().join("models/current.vmdl")]
    );
    for invalid in [
      "../outside.vmdl",
      "models/missing.vmdl",
      "models",
      "/absolute.vmdl",
    ] {
      assert!(
        selected_sources(root.path(), vec![invalid.into()]).is_err(),
        "{invalid}"
      );
    }
    assert!(selected_sources(root.path(), Vec::new()).is_err());
  }
  #[test]
  fn fused_children_are_not_standalone_compiler_inputs() {
    let root = tempfile::tempdir().unwrap();
    for file in [
      "hero.vnmgraph",
      "hero.vnmgraph+familiar.vnmgraph",
      "body.vmdl",
    ] {
      std::fs::write(root.path().join(file), b"fixture").unwrap();
    }
    let extensions = ["vnmgraph", "vmdl"].map(str::to_string).into();
    let files = source_files(root.path(), &extensions).unwrap();
    assert_eq!(files.len(), 2);
    assert!(
      files
        .iter()
        .all(|path| !path.file_name().unwrap().to_string_lossy().contains('+'))
    );
  }
  #[test]
  fn only_registered_resource_types_are_compiler_inputs() {
    let metadata = r#"{ assettypes = { model = { m_Ext = "vmdl" nested = { m_Ext = "dmx" } m_CompilerIdentifier = "CompileModel" } image = { m_Ext = "png" } clip = { m_Ext = "vnmclip" m_CompilerIdentifier = "CompileNmClip" } sound = { m_Ext = "vsnd" m_AdditionalExtensions = ["mp3", "wav"] m_CompilerIdentifier = "CompileSound" } } }"#;
    let extensions = compiler_extensions(metadata);
    assert_eq!(
      extensions,
      ["mp3", "vmdl", "vnmclip", "vsnd", "wav"]
        .map(str::to_string)
        .into()
    );
    let root = tempfile::tempdir().unwrap();
    for file in ["model.vmdl", "source.dmx", "texture.png", "clip.vnmclip"] {
      std::fs::write(root.path().join(file), b"fixture").unwrap();
    }
    let inputs = source_files(root.path(), &extensions).unwrap();
    assert_eq!(inputs.len(), 2);
    assert!(inputs.iter().all(|path| path.extension().unwrap() != "dmx"));
  }

  #[test]
  fn test_packages_include_addon_assets_and_exclude_editor_support_files() {
    let root = tempfile::tempdir().unwrap();
    let output = tempfile::tempdir().unwrap();
    for folder in ["models/hero", "tools", ".cache", "materials/tools"] {
      std::fs::create_dir_all(root.path().join(folder)).unwrap();
    }
    for file in [
      "models/hero/body.vmdl_c",
      "materials/tools/grid.vtex_c",
      "addoninfo.txt",
      "toolscenelightrigs.vdata_c",
      "tools/modeldoc_editor_presets.txt",
      ".cache/something",
    ] {
      std::fs::write(root.path().join(file), b"fixture").unwrap();
    }
    pack_files(root.path(), output.path()).unwrap();
    assert!(output.path().join("models/hero/body.vmdl_c").is_file());
    assert!(output.path().join("materials/tools/grid.vtex_c").is_file());
    for file in [
      "addoninfo.txt",
      "tools",
      "toolscenelightrigs.vdata_c",
      ".cache",
    ] {
      assert!(!output.path().join(file).exists());
    }
  }
}
