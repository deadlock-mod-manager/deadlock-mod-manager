use base64::Engine;
use regex::Regex;
use reqwest::Url;
use std::sync::LazyLock;

use super::NativeSourceSummary;
use super::network::{invalid, source_request_client};
use crate::errors::Error;

const MAX_MEDIA_BYTES: usize = 2 * 1024 * 1024;
const MAX_ICON_DATA_URL: usize = 128 * 1024 * 4 / 3 + 64;
static LINK_TAG: LazyLock<Regex> =
  LazyLock::new(|| Regex::new(r"(?is)<link\b[^>]*>").expect("valid regex"));
static LINK_ATTR: LazyLock<Regex> = LazyLock::new(|| {
  Regex::new(r#"(?i)\s(rel|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))"#).expect("valid regex")
});

async fn fetch_bounded(value: &str, allow_local_network: bool) -> Result<(String, Vec<u8>), Error> {
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
  Ok((content_type, bytes))
}

/// Browser loads cannot inherit native transport's pinned DNS or redirect
/// policy. Only bounded, verified raster bytes cross the IPC boundary.
pub(super) async fn raster_data_url(
  value: &str,
  allow_local_network: bool,
) -> Result<String, Error> {
  let (content_type, bytes) = fetch_bounded(value, allow_local_network).await?;
  raster_data(&content_type, &bytes)
}

fn raster_data(content_type: &str, bytes: &[u8]) -> Result<String, Error> {
  let mime = raster_mime(bytes)
    .ok_or_else(|| invalid("Source media must contain a supported raster image"))?;
  let compatible_mime = content_type == mime
    || (mime == "image/x-icon"
      && ["image/vnd.microsoft.icon", "image/ico"].contains(&content_type));
  if !compatible_mime {
    return Err(invalid(
      "Source media MIME type does not match its raster bytes",
    ));
  }
  Ok(data_url(mime, bytes))
}

fn data_url(mime: &str, bytes: &[u8]) -> String {
  format!(
    "data:{mime};base64,{}",
    base64::engine::general_purpose::STANDARD.encode(bytes)
  )
}

/// Icons only render through `<img>`, where SVG cannot run scripts or load
/// subresources, so icons may be SVG while listing images stay raster-only.
async fn icon_data_url(value: &str, allow_local_network: bool) -> Result<String, Error> {
  let (content_type, bytes) = fetch_bounded(value, allow_local_network).await?;
  let icon = if content_type == "image/svg+xml" && is_svg(&bytes) {
    data_url("image/svg+xml", &bytes)
  } else {
    raster_data(&content_type, &bytes)?
  };
  if icon.len() > MAX_ICON_DATA_URL {
    return Err(invalid("Source icon exceeds the 128 KiB limit"));
  }
  Ok(icon)
}

fn is_svg(bytes: &[u8]) -> bool {
  let head = String::from_utf8_lossy(&bytes[..bytes.len().min(1024)]).to_ascii_lowercase();
  let head = head.trim_start_matches('\u{feff}').trim_start();
  head.starts_with('<') && head.contains("<svg") && !head.contains("<html")
}

pub(super) async fn hydrate_source_icon(source: &mut NativeSourceSummary) {
  // Media is optional. Its outage must not invalidate an installable source.
  let declared = match source.descriptor.icon_url.take() {
    Some(url) => icon_data_url(&url, source.allow_local_network).await.ok(),
    None => None,
  };
  source.descriptor.icon_url = match declared {
    Some(icon) => Some(icon),
    None => site_favicon(source).await,
  };
}

/// Without a usable declared icon, use the site's favicon the way a browser
/// tab would: `/favicon.ico`, then the page's `<link rel="icon">` entries.
async fn site_favicon(source: &NativeSourceSummary) -> Option<String> {
  let allow_local_network = source.allow_local_network;
  let page = source
    .descriptor
    .homepage_url
    .as_deref()
    .unwrap_or(&source.accepted_origin);
  let page = Url::parse(page).ok()?;
  let favicon = page.join("/favicon.ico").ok()?;
  if let Ok(icon) = icon_data_url(favicon.as_str(), allow_local_network).await {
    return Some(icon);
  }
  let (_, html) = fetch_bounded(page.as_str(), allow_local_network)
    .await
    .ok()?;
  for href in icon_links(&String::from_utf8_lossy(&html))
    .into_iter()
    .take(4)
  {
    let Ok(url) = page.join(&href) else { continue };
    if let Ok(icon) = icon_data_url(url.as_str(), allow_local_network).await {
      return Some(icon);
    }
  }
  None
}

fn icon_links(html: &str) -> Vec<String> {
  LINK_TAG
    .find_iter(html)
    .filter_map(|tag| {
      let (mut rel, mut href) = (None, None);
      for attr in LINK_ATTR.captures_iter(tag.as_str()) {
        let value = attr
          .get(2)
          .or(attr.get(3))
          .or(attr.get(4))
          .map(|m| m.as_str());
        if attr[1].eq_ignore_ascii_case("rel") {
          rel = value;
        } else {
          href = value;
        }
      }
      rel?
        .split_ascii_whitespace()
        .any(|token| token.eq_ignore_ascii_case("icon"))
        .then(|| href.map(|href| href.trim().replace("&amp;", "&")))?
    })
    .collect()
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

  #[test]
  fn svg_icons_must_be_svg_documents() {
    assert!(is_svg(
      "\u{feff}<?xml version='1.0'?><svg xmlns='http://www.w3.org/2000/svg'/>".as_bytes()
    ));
    assert!(!is_svg(b"<!doctype html><html><svg/></html>"));
  }

  #[test]
  fn favicon_links_are_read_from_icon_rels_only() {
    let html = r#"<head>
      <link rel="stylesheet" href="app.css">
      <LINK href='/a.png?x=1&amp;y=2' REL='shortcut icon'>
      <link rel=apple-touch-icon href=/touch.png>
      <link data-href="/no.png" rel="icon" href="assets/brand-mark.svg" type="image/svg+xml">
    </head>"#;
    assert_eq!(
      icon_links(html),
      ["/a.png?x=1&y=2", "assets/brand-mark.svg"]
    );
  }
}
