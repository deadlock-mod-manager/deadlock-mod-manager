use super::modding_workspace::{ModdingHierarchy, contained, relative};
use crate::{app_runtime::AppHandle, errors::Error};
use base64::{Engine, engine::general_purpose::STANDARD};

const MAX_DOCUMENT_BYTES: usize = 16 * 1024 * 1024;

#[tauri::command]
pub async fn preview_modding_archive_file(
  path: String,
  archive_path: Option<String>,
) -> Result<String, Error> {
  relative(&path, false)?;
  let archive = super::modding_archive::archive_path(archive_path)?;
  tauri::async_runtime::spawn_blocking(move || {
    let archive = super::foundry::open_archive(&archive, None)?;
    let data = archive
      .extract_entry_limited(&path, 64 * 1024 * 1024)
      .map_err(|error| Error::InvalidInput(error.to_string()))?;
    preview_bytes(&path, &data)
  })
  .await
  .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}

#[tauri::command]
pub async fn preview_modding_text(
  app: AppHandle,
  addon_id: String,
  hierarchy: ModdingHierarchy,
  path: String,
) -> Result<String, Error> {
  let file = contained(
    &super::modding_local::resolve_read(&app, &addon_id)?.root(hierarchy),
    &path,
  )?;
  tauri::async_runtime::spawn_blocking(move || {
    use std::io::Read;
    let mut bytes = Vec::new();
    std::fs::File::open(file)?
      .take(MAX_DOCUMENT_BYTES as u64 + 1)
      .read_to_end(&mut bytes)?;
    document_preview(&path, &bytes)
  })
  .await
  .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}

pub(super) fn text_preview(bytes: &[u8]) -> Result<String, Error> {
  if bytes.len() > MAX_DOCUMENT_BYTES {
    return Err(Error::InvalidInput(
      "Text previews are limited to 16 MB".into(),
    ));
  }
  if bytes.contains(&0) && !bytes.starts_with(&[0xff, 0xfe]) && !bytes.starts_with(&[0xfe, 0xff]) {
    return Err(Error::InvalidInput("This file contains binary data".into()));
  }
  Ok(crate::mod_manager::perf_config::formats::decode_text(bytes))
}

fn document_preview(path: &str, data: &[u8]) -> Result<String, Error> {
  if data.len() > MAX_DOCUMENT_BYTES {
    return Err(Error::InvalidInput(
      "Document previews are limited to 16 MB".into(),
    ));
  }
  if !path.to_ascii_lowercase().ends_with("_c") {
    return text_preview(data);
  }
  match super::modding_content_search::decode(path, data.to_vec()) {
    Ok(document) => Ok(document.text),
    Err(error) => {
      let resource = vpkmanager::source2::resource::Resource::parse(data).map_err(|_| error)?;
      let mut summary = format!(
        "header_version = 12\nresource_version = {}\nblocks = [\n",
        u16::from_le_bytes([data[6], data[7]])
      );
      for block in resource.blocks() {
        summary.push_str(&format!(
          "  {{ type = {:?} offset = {} size = {} }},\n",
          String::from_utf8_lossy(&block.kind),
          block.offset,
          block.size
        ));
      }
      summary.push_str("]\n");
      Ok(summary)
    }
  }
}

fn preview_bytes(path: &str, data: &[u8]) -> Result<String, Error> {
  let extension = path.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
  let (mime, payload) = match extension.as_str() {
    "vtex_c" => {
      let decoded = source2_model::decode_texture_png_bytes(data.to_vec())
        .map_err(|error| Error::InvalidInput(error.to_string()))?;
      return Ok(format!(
        "data:image/png;base64,{}",
        STANDARD.encode(decoded.png)
      ));
    }
    "png" | "jpg" | "jpeg" | "webp" | "tga" | "gif" | "bmp" => {
      let mut reader = image::ImageReader::new(std::io::Cursor::new(data)).with_guessed_format()?;
      let mut limits = image::Limits::default();
      limits.max_alloc = Some(128 * 1024 * 1024);
      reader.limits(limits);
      let image = reader
        .decode()
        .map_err(|error| Error::InvalidInput(error.to_string()))?;
      let image = if image.width() > 4096 || image.height() > 4096 {
        image.thumbnail(4096, 4096)
      } else {
        image
      };
      let mut png = std::io::Cursor::new(Vec::new());
      image
        .write_to(&mut png, image::ImageFormat::Png)
        .map_err(|error| Error::InvalidInput(error.to_string()))?;
      return Ok(format!(
        "data:image/png;base64,{}",
        STANDARD.encode(png.into_inner())
      ));
    }
    "vsnd_c" => (
      "audio/mpeg",
      super::foundry::find_mp3_payload(data).ok_or_else(|| {
        Error::InvalidInput("This sound does not contain a playable MP3 payload".into())
      })?,
    ),
    "mp3" => ("audio/mpeg", data),
    "wav" => ("audio/wav", data),
    "ogg" => ("audio/ogg", data),
    "flac" => ("audio/flac", data),
    "m4a" => ("audio/mp4", data),
    "aac" => ("audio/aac", data),
    _ => return document_preview(path, data),
  };
  Ok(format!("data:{mime};base64,{}", STANDARD.encode(payload)))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn text_previews_preserve_text_and_reject_binary_or_oversized_input() {
    assert_eq!(
      text_preview(b"{\n  test = true\n}\n").unwrap(),
      "{\n  test = true\n}\n"
    );
    assert!(text_preview(&[0, 1, 2]).is_err());
    assert!(text_preview(&vec![b'a'; 2 * 1024 * 1024]).is_ok());
    assert!(text_preview(&vec![b'a'; MAX_DOCUMENT_BYTES + 1]).is_err());
  }

  #[test]
  fn text_previews_accept_valve_legacy_text_and_utf16() {
    assert!(
      text_preview(b"Desktop\xa0Haswell\xa0GT1")
        .unwrap()
        .contains("Haswell")
    );
    assert_eq!(text_preview(&[0xff, 0xfe, b'H', 0, b'i', 0]).unwrap(), "Hi");
    assert_eq!(text_preview(&[0xfe, 0xff, 0, b'H', 0, b'i']).unwrap(), "Hi");
  }

  fn compiled_fixture(payload: &[u8]) -> Vec<u8> {
    let mut bytes = vec![0u8; 28];
    bytes[0..4].copy_from_slice(&((28 + payload.len()) as u32).to_le_bytes());
    bytes[4..6].copy_from_slice(&12u16.to_le_bytes());
    bytes[8..12].copy_from_slice(&8u32.to_le_bytes());
    bytes[12..16].copy_from_slice(&1u32.to_le_bytes());
    bytes[16..20].copy_from_slice(b"DATA");
    bytes[20..24].copy_from_slice(&8u32.to_le_bytes());
    bytes[24..28].copy_from_slice(&(payload.len() as u32).to_le_bytes());
    bytes.extend_from_slice(payload);
    bytes
  }

  #[test]
  fn data_sound_events_and_other_resources_have_readable_previews() {
    use vpkmanager::source2::kv3::{Format, Value};
    let payload = vpkmanager::source2::kv3::encode(
      &Value::Object(vec![(
        "type".into(),
        Value::String("citadel_music_title".into()),
      )]),
      &Format([0; 16]),
    );
    let compiled = compiled_fixture(&payload);
    for name in [
      "abilities.vdata_c",
      "music.vsndevts_c",
      "material.vmat_c",
      "graph.vnmgraph_c",
      "post.vpost_c",
    ] {
      let preview = preview_bytes(name, &compiled).unwrap();
      assert!(
        preview.contains("type = \"citadel_music_title\""),
        "{name}: {preview}"
      );
    }
    for name in [
      "abilities.vdata",
      "music.vsndevts",
      "settings.kv3",
      "script.lua",
      "notes.custom",
    ] {
      assert_eq!(
        preview_bytes(name, b"{ type = \"example\" }").unwrap(),
        "{ type = \"example\" }"
      );
    }
  }

  #[test]
  fn opaque_source2_resources_show_block_information_without_exposing_binary_as_text() {
    let compiled = compiled_fixture(&[0, 1, 2, 3]);
    let preview = preview_bytes("collision.vphys_c", &compiled).unwrap();
    assert!(preview.contains("header_version = 12"));
    assert!(preview.contains("type = \"DATA\""));
    assert!(preview.contains("size = 4"));
    assert!(preview_bytes("invalid.vdata_c", b"not a resource").is_err());
    assert!(preview_bytes("unsupported.bin", &[0, 1, 2, 3]).is_err());
  }

  #[test]
  fn archive_images_are_converted_to_png_data_urls() {
    let image = image::RgbaImage::from_pixel(2, 2, image::Rgba([12, 34, 56, 255]));
    let mut bytes = std::io::Cursor::new(Vec::new());
    image.write_to(&mut bytes, image::ImageFormat::Png).unwrap();
    let preview = preview_bytes("textures/test.png", &bytes.into_inner()).unwrap();
    let png = STANDARD
      .decode(preview.strip_prefix("data:image/png;base64,").unwrap())
      .unwrap();
    let decoded = image::load_from_memory(&png).unwrap().to_rgba8();
    assert_eq!(decoded.dimensions(), (2, 2));
    assert_eq!(decoded.as_raw(), image.as_raw());
  }
}
