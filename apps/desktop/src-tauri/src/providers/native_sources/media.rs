use base64::Engine;
use reqwest::Url;

use super::NativeSourceSummary;
use super::network::{invalid, source_request_client};
use crate::errors::Error;

const MAX_MEDIA_BYTES: usize = 2 * 1024 * 1024;

/// Browser loads cannot inherit native transport's pinned DNS or redirect
/// policy. Only bounded, verified raster bytes cross the IPC boundary.
pub(super) async fn raster_data_url(
  value: &str,
  allow_local_network: bool,
) -> Result<String, Error> {
  let _permit = super::network::request_permit().await?;
  let url = Url::parse(value).map_err(|_| invalid("Invalid media URL"))?;
  let client = source_request_client(&url, allow_local_network).await?;
  let mut response = client
    .get(url)
    .send()
    .await
    .map_err(|_| invalid("Source media unavailable"))?;
  if !response.status().is_success()
    || response
      .content_length()
      .is_some_and(|length| length > MAX_MEDIA_BYTES as u64)
  {
    return Err(invalid("Source media failed or exceeds the 2 MiB limit"));
  }
  let content_type = response
    .headers()
    .get(reqwest::header::CONTENT_TYPE)
    .and_then(|value| value.to_str().ok())
    .and_then(|value| value.split(';').next())
    .unwrap_or_default()
    .trim()
    .to_ascii_lowercase();
  let mut bytes = Vec::new();
  while let Some(chunk) = response
    .chunk()
    .await
    .map_err(|_| invalid("Source media response interrupted"))?
  {
    if bytes.len() + chunk.len() > MAX_MEDIA_BYTES {
      return Err(invalid("Source media exceeds the 2 MiB limit"));
    }
    bytes.extend_from_slice(&chunk);
  }
  let mime = raster_mime(&bytes)
    .ok_or_else(|| invalid("Source media must contain a supported raster image"))?;
  let compatible_mime = content_type == mime
    || (mime == "image/x-icon"
      && ["image/vnd.microsoft.icon", "image/ico"].contains(&content_type.as_str()));
  if !compatible_mime {
    return Err(invalid(
      "Source media MIME type does not match its raster bytes",
    ));
  }
  Ok(format!(
    "data:{mime};base64,{}",
    base64::engine::general_purpose::STANDARD.encode(bytes)
  ))
}

pub(super) async fn hydrate_source_icon(source: &mut NativeSourceSummary) {
  if let Some(url) = source.descriptor.icon_url.take() {
    // Media is optional. Its outage must not invalidate an installable source.
    source.descriptor.icon_url = raster_data_url(&url, source.allow_local_network)
      .await
      .ok()
      .filter(|data_url| data_url.len() <= 128 * 1024 * 4 / 3 + 64);
  }
}

fn raster_mime(bytes: &[u8]) -> Option<&'static str> {
  if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
    Some("image/png")
  } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
    Some("image/jpeg")
  } else if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
    Some("image/webp")
  } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
    Some("image/gif")
  } else if bytes.starts_with(&[0, 0, 1, 0]) {
    Some("image/x-icon")
  } else {
    None
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn executable_or_mislabeled_image_bytes_are_not_rasters() {
    assert_eq!(
      raster_mime(b"<svg xmlns='http://www.w3.org/2000/svg'/>"),
      None
    );
    assert_eq!(
      raster_mime(b"<!doctype html><script>alert(1)</script>"),
      None
    );
    assert_eq!(raster_mime(b"\x89PNG\r\n\x1a\n"), Some("image/png"));
  }
}
