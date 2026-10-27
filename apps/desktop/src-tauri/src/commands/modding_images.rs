use super::modding_workspace::{ModdingAddon, contained, relative, resolve};
use crate::{app_runtime::AppHandle, errors::Error};
use serde::{Deserialize, Serialize};
use std::{
  collections::HashSet,
  io::Read,
  path::{Path, PathBuf},
  sync::LazyLock,
};
use tauri::Manager;
use ts_rs::TS;
#[derive(Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingImageInput {
  pub path: String,
  pub output: String,
}
#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingImageBuild {
  pub outputs: Vec<String>,
  pub log_path: String,
}
fn descriptor(input: &str) -> Result<String, Error> {
  let file =
    serde_json::to_string(input).map_err(|error| Error::InvalidInput(error.to_string()))?;
  Ok(format!(
    r#"<!-- dmx encoding keyvalues2_noids 1 format vtex 1 -->
// DMM generated image texture
"CDmeVtex"
{{
 "m_inputTextureArray" "element_array"
 [ "CDmeInputTexture" {{ "m_name" "string" "InputTexture0" "m_fileName" "string" {file} "m_colorSpace" "string" "srgb" "m_typeString" "string" "2D" }} ]
 "m_outputTypeString" "string" "2D"
 "m_outputFormat" "string" "DXT5"
 "m_textureOutputChannelArray" "element_array"
 [ "CDmeTextureOutputChannel" {{ "m_inputTextureArray" "string_array" [ "InputTexture0" ] "m_srcChannels" "string" "rgba" "m_dstChannels" "string" "rgba" "m_mipAlgorithm" "CDmeImageProcessor" {{ "m_algorithm" "string" "Box" }} "m_outputColorSpace" "string" "srgb" }} ]
}}
"#
  ))
}
pub(super) fn image_inputs(root: &Path) -> Result<Vec<ModdingImageInput>, Error> {
  Ok(
    super::modding_batch::files(root)?
      .into_iter()
      .filter(|path| {
        Path::new(path)
          .extension()
          .and_then(|ext| ext.to_str())
          .is_some_and(|ext| {
            ["png", "svg", "psd", "tga", "jpg", "jpeg"]
              .iter()
              .any(|supported| ext.eq_ignore_ascii_case(supported))
          })
      })
      .map(|path| {
        let output = Path::new(&path)
          .with_extension("vtex_c")
          .to_string_lossy()
          .replace('\\', "/");
        ModdingImageInput { path, output }
      })
      .collect(),
  )
}
fn misplaced_images(root: &Path) -> Result<Vec<String>, Error> {
  if !root.exists() {
    return Ok(Vec::new());
  }
  let files = super::modding_batch::files(root)?;
  let images: Vec<_> = files
    .iter()
    .filter(|path| {
      let normalized = path.to_ascii_lowercase();
      let image = Path::new(path)
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
          [
            "png", "jpg", "jpeg", "tga", "svg", "psd", "webp", "bmp", "gif", "tif", "tiff", "exr",
            "hdr", "dds", "avif", "ico", "apng",
          ]
          .iter()
          .any(|supported| extension.eq_ignore_ascii_case(supported))
        });
      image && !normalized.starts_with("panorama/images/")
    })
    .cloned()
    .collect();
  if images.is_empty() {
    return Ok(images);
  }
  let candidates: HashSet<_> = images
    .iter()
    .map(|path| path.to_ascii_lowercase())
    .collect();
  let mut referenced = HashSet::new();
  for source in &files {
    let extension = Path::new(source)
      .extension()
      .and_then(|extension| extension.to_str())
      .unwrap_or_default()
      .to_ascii_lowercase();
    if ![
      "vmdl", "vmat", "vtex", "dmx", "gltf", "mtl", "vdata", "xml", "vxml", "html", "css", "vcss",
      "js", "jsx", "ts", "tsx", "json",
    ]
    .contains(&extension.as_str())
    {
      continue;
    }
    const MAX_SOURCE: u64 = 16 * 1024 * 1024;
    let mut bytes = Vec::new();
    std::fs::File::open(contained(root, source)?)?
      .take(MAX_SOURCE + 1)
      .read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_SOURCE {
      return Err(Error::InvalidInput(format!(
        "Cannot finish the image reference check: {source} exceeds 16 MB"
      )));
    }
    if let Ok(text) = std::str::from_utf8(&bytes) {
      referenced.extend(image_references(root, source, text, &candidates));
    }
  }
  Ok(
    images
      .into_iter()
      .filter(|path| !referenced.contains(&path.to_ascii_lowercase()))
      .collect(),
  )
}

fn normalized_image_path(path: &str) -> Option<String> {
  let mut parts = Vec::new();
  for part in path.split('/') {
    match part {
      "" | "." => {}
      ".." => {
        parts.pop()?;
      }
      part if part.contains([':', '\0', '\n', '\r']) => return None,
      part => parts.push(part),
    }
  }
  Some(parts.join("/"))
}

fn image_references(
  root: &Path,
  source: &str,
  text: &str,
  candidates: &HashSet<String>,
) -> HashSet<String> {
  static REFERENCES: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(
      r#"(?s:<!--.*?-->|/\*.*?\*/)|//[^\r\n]*|"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([A-Za-z0-9_{}./\\:-]+\.[A-Za-z0-9_]+)"#,
    ).expect("image source references")
  });
  let root = root
    .to_string_lossy()
    .replace('\\', "/")
    .to_ascii_lowercase();
  let parent = source
    .rsplit_once('/')
    .map_or("", |(parent, _)| parent)
    .to_ascii_lowercase();
  REFERENCES
    .captures_iter(text)
    .filter_map(|capture| {
      let value = capture
        .get(1)
        .or_else(|| capture.get(2))
        .or_else(|| capture.get(3))?
        .as_str();
      let value = value
        .replace("\\\\", "/")
        .replace('\\', "/")
        .to_ascii_lowercase();
      let value = value.trim();
      let value = value.strip_prefix("file://").unwrap_or(value);
      let root_prefix = format!("{root}/");
      let value = value.strip_prefix(&root_prefix).unwrap_or(value);
      let value = value.strip_prefix("{images}/").map_or_else(
        || value.to_owned(),
        |rest| format!("panorama/images/{rest}"),
      );
      if !value.starts_with("./") && !value.starts_with("../") {
        let path = normalized_image_path(&value)?;
        if candidates.contains(&path) {
          return Some(path);
        }
        if value.starts_with('/') {
          return None;
        }
      }
      let path = normalized_image_path(&format!("{parent}/{value}"))?;
      candidates.contains(&path).then_some(path)
    })
    .collect()
}

#[tauri::command]
pub async fn scan_modding_image_locations(
  app: AppHandle,
  addon_id: String,
  hierarchy: super::modding_workspace::ModdingHierarchy,
) -> Result<Vec<String>, Error> {
  let root = super::modding_local::resolve_read(&app, &addon_id)?.root(hierarchy);
  tauri::async_runtime::spawn_blocking(move || misplaced_images(&root))
    .await
    .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}

pub(super) fn prepare(root: &Path, inputs: &[ModdingImageInput]) -> Result<Vec<PathBuf>, Error> {
  if inputs.is_empty() || inputs.len() > 8192 {
    return Err(Error::InvalidInput(
      "Select between 1 and 8192 image inputs".into(),
    ));
  }
  let mut targets = std::collections::BTreeSet::new();
  let mut descriptors = Vec::new();
  // Validate every destination before creating any generated files.
  for input in inputs {
    relative(&input.path, false)?;
    relative(&input.output, false)?;
    if !input.output.ends_with(".vtex_c") || !targets.insert(input.output.to_lowercase()) {
      return Err(Error::InvalidInput(format!(
        "Choose a unique .vtex_c output path for {}",
        input.path
      )));
    }
    let file = contained(root, &input.path)?;
    if !file.is_file() {
      return Err(Error::InvalidInput(format!(
        "Missing input: {}",
        input.path
      )));
    }
    let target = contained(root, input.output.trim_end_matches("_c"))?;
    if target.exists()
      && !std::fs::read_to_string(&target)?.contains("// DMM generated image texture")
    {
      return Err(Error::InvalidInput(format!(
        "{} is an existing texture definition. Compile that source directly or choose another output path; it will not be overwritten.",
        target.display()
      )));
    }
  }
  for input in inputs {
    let file = contained(root, &input.path)?;
    let extension = file
      .extension()
      .and_then(|ext| ext.to_str())
      .unwrap_or("")
      .to_ascii_lowercase();
    let source = if extension == "svg" {
      let generated = format!(
        ".dmm-generated/{}.png",
        super::modding_edits::fingerprint(input.path.as_bytes())
      );
      let output = contained(root, &generated)?;
      std::fs::create_dir_all(output.parent().unwrap())?;
      let result = std::process::Command::new("rsvg-convert")
        .arg("--output")
        .arg(&output)
        .arg(&file)
        .output()
        .map_err(|error| {
          Error::InvalidInput(format!(
            "SVG rasterization requires rsvg-convert on PATH: {error}"
          ))
        })?;
      if !result.status.success() {
        return Err(Error::InvalidInput(format!(
          "{}: SVG conversion failed: {}",
          input.path,
          String::from_utf8_lossy(&result.stderr)
        )));
      }
      generated
    } else if ["png", "tga", "jpg", "jpeg"].contains(&extension.as_str()) {
      let mut reader = image::ImageReader::open(&file)?.with_guessed_format()?;
      let mut limits = image::Limits::default();
      limits.max_alloc = Some(128 * 1024 * 1024);
      reader.limits(limits);
      reader
        .decode()
        .map_err(|error| Error::InvalidInput(format!("{}: {error}", input.path)))?;
      input.path.clone()
    } else if extension == "psd" {
      input.path.clone()
    } else {
      return Err(Error::InvalidInput(format!(
        "Unsupported image input: {}",
        input.path
      )));
    };
    let target = contained(root, input.output.trim_end_matches("_c"))?;
    super::modding_edits::write_atomic(&target, descriptor(&source)?.as_bytes())?;
    descriptors.push(target);
  }
  // The compiler owns generated texture names and material references.
  for path in super::modding_batch::files(root)?
    .into_iter()
    .filter(|path| path.ends_with(".vmat"))
  {
    let file = contained(root, &path)?;
    let text = std::fs::read_to_string(&file)?;
    if super::modding_source::fields(&text)?.iter().any(|field| {
      inputs
        .iter()
        .any(|input| text[field.start..field.end].trim_matches('"') == input.path)
    }) {
      descriptors.push(file);
    }
  }
  Ok(descriptors)
}
#[tauri::command]
pub async fn list_modding_image_inputs(
  app: AppHandle,
  addon_id: String,
) -> Result<Vec<ModdingImageInput>, Error> {
  let root = PathBuf::from(resolve(&app, &addon_id)?.content_path);
  tauri::async_runtime::spawn_blocking(move || image_inputs(&root))
    .await
    .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}
pub(super) fn context(
  app: &AppHandle,
) -> Result<
  (
    super::modding_tools::ModdingToolsConfig,
    PathBuf,
    Option<PathBuf>,
  ),
  Error,
> {
  Ok((
    super::modding_tools::get_modding_tools_config(app.clone())?,
    app.path().app_data_dir()?.join("tools"),
    super::state::MANAGER
      .lock()
      .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
      .get_steam_manager()
      .get_steam_path(),
  ))
}
#[tauri::command]
pub async fn compile_modding_images(
  app: AppHandle,
  addon_id: String,
  inputs: Vec<ModdingImageInput>,
) -> Result<ModdingImageBuild, Error> {
  let addon = resolve(&app, &addon_id)?;
  let (config, tools, steam) = context(&app)?;
  tauri::async_runtime::spawn_blocking(move || {
    let _guard = super::modding_build::BUILD_LOCK
      .lock()
      .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?;
    let selected = prepare(Path::new(&addon.content_path), &inputs)?;
    std::fs::create_dir_all(&tools)?;
    let log = tools.join(format!("images-{}.log", addon.id));
    super::modding_build::compile(&addon, config, &tools, steam, &log, Some(selected))?;
    for input in &inputs {
      if !contained(Path::new(&addon.game_path), &input.output)?.is_file() {
        return Err(Error::InvalidInput(format!(
          "Compiler did not produce {}. See {}",
          input.output,
          log.display()
        )));
      }
    }
    Ok(ModdingImageBuild {
      outputs: inputs.into_iter().map(|input| input.output).collect(),
      log_path: log.to_string_lossy().into_owned(),
    })
  })
  .await
  .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}
#[derive(Clone, Deserialize, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingVariant {
  pub name: String,
  pub content_path: String,
  pub game_path: Option<String>,
}
fn variants(root: &Path) -> Result<Vec<ModdingVariant>, Error> {
  let mut result = Vec::new();
  let mut candidates = vec![root.to_owned()];
  for entry in std::fs::read_dir(root)? {
    let entry = entry?;
    if entry.file_type()?.is_dir() && !entry.file_name().to_string_lossy().starts_with('.') {
      candidates.push(entry.path());
    }
  }
  for folder in candidates {
    let content = if folder.join("content").is_dir() {
      folder.join("content")
    } else {
      folder.clone()
    };
    if !["materials", "models", "panorama", "sounds"]
      .iter()
      .any(|name| content.join(name).is_dir())
    {
      continue;
    }
    let sources = super::modding_batch::files(&content)?;
    if !sources.iter().any(|path| {
      ["vmat", "vtex", "vpcf", "png", "svg", "psd"].contains(
        &Path::new(path)
          .extension()
          .and_then(|ext| ext.to_str())
          .unwrap_or(""),
      )
    }) {
      continue;
    }
    let name = folder
      .file_name()
      .unwrap_or_default()
      .to_string_lossy()
      .into_owned();
    let game = folder.join("game");
    result.push(ModdingVariant {
      name,
      content_path: content.canonicalize()?.to_string_lossy().into_owned(),
      game_path: game.is_dir().then(|| game.to_string_lossy().into_owned()),
    });
  }
  result.sort_by(|a, b| a.name.cmp(&b.name));
  Ok(result)
}
#[tauri::command]
pub async fn discover_modding_variants(directory: String) -> Result<Vec<ModdingVariant>, Error> {
  tauri::async_runtime::spawn_blocking(move || variants(Path::new(&directory)))
    .await
    .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}
#[tauri::command]
pub async fn build_modding_variant(
  app: AppHandle,
  variant: ModdingVariant,
  destination: String,
  excluded: Vec<String>,
) -> Result<ModdingImageBuild, Error> {
  let (config, tools, steam) = context(&app)?;
  tauri::async_runtime::spawn_blocking(move || {
    let _guard = super::modding_build::BUILD_LOCK
      .lock()
      .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?;
    let destination = PathBuf::from(destination);
    if !destination.is_absolute() || !destination.is_dir() {
      return Err(Error::InvalidInput(
        "Choose an existing output folder".into(),
      ));
    }
    relative(&variant.name, false)?;
    if Path::new(&variant.name).components().count() != 1 {
      return Err(Error::InvalidInput("Invalid variant name".into()));
    }
    let output = destination.join(format!("{}_dir.vpk", variant.name));
    if output.exists() {
      return Err(Error::InvalidInput(format!(
        "{} already exists. Choose an empty destination to preserve previous builds.",
        output.display()
      )));
    }
    let workspace = tempfile::tempdir()?;
    let content = workspace.path().join("content");
    let game = workspace.path().join("game");
    std::fs::create_dir_all(&content)?;
    std::fs::create_dir_all(&game)?;
    super::modding_build::pack_files(Path::new(&variant.content_path), &content)?;
    if let Some(source) = &variant.game_path {
      super::modding_build::pack_files(Path::new(source), &game)?;
    }
    let inputs: Vec<_> = image_inputs(&content)?
      .into_iter()
      .filter(|input| !excluded.contains(&input.path))
      .collect();
    for path in &excluded {
      relative(path, false)?;
      let target = contained(&content, path)?;
      if target.is_file() {
        std::fs::remove_file(target)?;
      }
    }
    if !inputs.is_empty() {
      prepare(&content, &inputs)?;
    }
    let id = super::modding_edits::fingerprint(workspace.path().to_string_lossy().as_bytes());
    let addon = ModdingAddon {
      id: id.clone(),
      name: variant.name,
      sdk_root: workspace.path().to_string_lossy().into_owned(),
      content_path: content.to_string_lossy().into_owned(),
      game_path: game.to_string_lossy().into_owned(),
      archive_path: super::state::game_path()?
        .join("game/citadel/pak01_dir.vpk")
        .to_string_lossy()
        .into_owned(),
    };
    std::fs::create_dir_all(&tools)?;
    let log = tools.join(format!("variant-{id}.log"));
    let sdk = PathBuf::from(&config.prepared_sdk);
    let result = super::modding_build::compile(&addon, config, &tools, steam, &log, None);
    // Remove only the two mounts owned by this temporary variant, including failed builds.
    for (hierarchy, target) in [("content", &content), ("game", &game)] {
      let link = sdk
        .join(hierarchy)
        .join("citadel_addons")
        .join(format!("dmm_link_{}", &id[..16]));
      if link.canonicalize().ok() == target.canonicalize().ok() {
        #[cfg(unix)]
        std::fs::remove_file(&link)?;
        #[cfg(windows)]
        std::fs::remove_dir(&link)?;
      }
    }
    result?;
    let assets = workspace.path().join("packed");
    std::fs::create_dir(&assets)?;
    super::modding_build::pack_files(&game, &assets)?;
    let packed = workspace.path().join("output.vpk");
    vpkmanager::pack_directory(&assets, &packed)
      .map_err(|error| Error::InvalidInput(error.to_string()))?;
    let mut temporary = tempfile::NamedTempFile::new_in(&destination)?;
    std::io::copy(&mut std::fs::File::open(packed)?, &mut temporary)?;
    temporary
      .persist_noclobber(&output)
      .map_err(|error| error.error)?;
    Ok(ModdingImageBuild {
      outputs: vec![output.to_string_lossy().into_owned()],
      log_path: log.to_string_lossy().into_owned(),
    })
  })
  .await
  .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}
#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn variant_discovery_skips_helper_folders_and_keeps_independent_paths() {
    let root = tempfile::tempdir().unwrap();
    for index in 0..40 {
      let path = root.path().join(format!("variant_{index}/materials/hair"));
      std::fs::create_dir_all(&path).unwrap();
      std::fs::write(path.join("hair.png"), b"fixture").unwrap();
    }
    std::fs::create_dir(root.path().join("gimp-files")).unwrap();
    assert_eq!(variants(root.path()).unwrap().len(), 40);
  }
  #[test]
  fn explicit_texture_paths_are_not_hash_guesses_and_existing_sources_are_preserved() {
    let root = tempfile::tempdir().unwrap();
    let image = image::RgbaImage::from_pixel(2, 2, image::Rgba([255, 0, 0, 255]));
    image.save(root.path().join("hair.png")).unwrap();
    let inputs = vec![ModdingImageInput {
      path: "hair.png".into(),
      output: "hair_png_b0ba69eb.vtex_c".into(),
    }];
    prepare(root.path(), &inputs).unwrap();
    let source = std::fs::read_to_string(root.path().join("hair_png_b0ba69eb.vtex")).unwrap();
    assert!(source.contains("\"m_fileName\" \"string\" \"hair.png\""));
    std::fs::write(root.path().join("hair_png_b0ba69eb.vtex"), b"author source").unwrap();
    assert!(prepare(root.path(), &inputs).is_err());
    assert_eq!(
      std::fs::read(root.path().join("hair_png_b0ba69eb.vtex")).unwrap(),
      b"author source"
    );
  }
}
#[tauri::command]
pub async fn list_modding_variant_inputs(
  directory: String,
) -> Result<Vec<ModdingImageInput>, Error> {
  tauri::async_runtime::spawn_blocking(move || image_inputs(Path::new(&directory)))
    .await
    .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}

#[cfg(test)]
mod location_tests {
  use super::*;
  fn write(root: &Path, path: &str, text: &str) {
    let target = root.join(path);
    std::fs::create_dir_all(target.parent().unwrap()).unwrap();
    std::fs::write(target, text).unwrap();
  }
  #[test]
  fn referenced_model_material_and_ui_images_are_allowed_outside_panorama() {
    let root = tempfile::tempdir().unwrap();
    for path in [
      "models/blend/gltf_embedded_1.png",
      "models/blend/gltf_embedded_3.png",
      "models/hero/portrait.png",
      "materials/shared/normal.tga",
      "panorama/custom/button.png",
      "panorama/custom/background.jpg",
      "models/unreferenced.png",
      "models/other/gltf_embedded_1.png",
    ] {
      write(root.path(), path, "image fixture");
    }
    write(
      root.path(),
      "models/blend/bee.vmat",
      "Layer0 { TextureColor \"./gltf_embedded_1.png\" TextureNormal \"./gltf_embedded_3.png\" }",
    );
    write(
      root.path(),
      "models/hero/hero.vmdl",
      "{ image = \"portrait.png\" }",
    );
    write(
      root.path(),
      "materials/hero.vtex",
      "{ input = \"materials\\\\shared\\\\normal.tga\" }",
    );
    write(
      root.path(),
      "panorama/layout/menu.xml",
      "<root><!-- <Image src=\"models/unreferenced.png\"/> --><Image src='../custom/button.png'/></root>",
    );
    write(
      root.path(),
      "panorama/styles/menu.css",
      "/* url(models/unreferenced.png) */ .menu { background: url(../custom/background.jpg); }",
    );
    assert_eq!(
      misplaced_images(root.path()).unwrap(),
      [
        "models/other/gltf_embedded_1.png",
        "models/unreferenced.png"
      ]
    );
    std::fs::remove_file(root.path().join("models/blend/bee.vmat")).unwrap();
    assert!(
      misplaced_images(root.path())
        .unwrap()
        .contains(&"models/blend/gltf_embedded_1.png".into())
    );
  }
  #[test]
  fn reference_resolution_stays_inside_the_addon_and_matches_complete_paths() {
    let root = tempfile::tempdir().unwrap();
    let candidates = HashSet::from(["models/icon.png".into(), "models/local/icon.png".into()]);
    let source = format!(
      r#"
      // "models/local/icon.png"
      /* 'models/local/icon.png' */
      "../../models/local/icon.png"
      "https://example.com/models/local/icon.png"
      "unrelated/models/local/icon.png"
      "file://{}/MODELS/ICON.PNG"
    "#,
      root.path().display()
    );
    assert_eq!(
      image_references(root.path(), "model.vmdl", &source, &candidates),
      HashSet::from(["models/icon.png".into()])
    );
    assert_eq!(
      image_references(
        root.path(),
        "Models/Local/source.vmdl",
        "{ texture = \"./icon.png\" }",
        &candidates
      ),
      HashSet::from(["models/local/icon.png".into()])
    );
  }
  #[test]
  fn scan_requires_the_panorama_images_root_and_ignores_compiled_resources() {
    let root = tempfile::tempdir().unwrap();
    for path in [
      "panorama/images/hud/icon.png",
      "Panorama/Images/nested/valid.PSD",
      "icon.svg",
      "models/images/wrong.tga",
      "images/wrong.png",
      "panorama/images_backup/wrong.jpg",
      "panorama/other/wrong.WEBP",
      "materials/texture.vtex_c",
      "models/model.vmdl",
      ".dmm-generated/ignored.png",
    ] {
      let target = root.path().join(path);
      std::fs::create_dir_all(target.parent().unwrap()).unwrap();
      std::fs::write(target, "fixture").unwrap();
    }
    assert_eq!(
      misplaced_images(root.path()).unwrap(),
      [
        "icon.svg",
        "images/wrong.png",
        "models/images/wrong.tga",
        "panorama/images_backup/wrong.jpg",
        "panorama/other/wrong.WEBP"
      ]
    );
    let source = root.path().join("images/wrong.png");
    std::fs::rename(source, root.path().join("panorama/images/fixed.png")).unwrap();
    assert!(
      !misplaced_images(root.path())
        .unwrap()
        .contains(&"images/wrong.png".into())
    );
  }
  #[cfg(unix)]
  #[test]
  fn image_checks_do_not_follow_links_out_of_the_project() {
    let root = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    std::fs::write(outside.path().join("private.png"), "fixture").unwrap();
    std::os::unix::fs::symlink(outside.path(), root.path().join("external")).unwrap();
    assert!(misplaced_images(root.path()).unwrap().is_empty());
  }
}
