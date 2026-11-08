//! Resolves the video links GameBanana lists in `_aEmbeddedMedia`.
//!
//! Mirrors `parseEmbeddedVideo` in `@deadlock-mods/shared`, which the API uses
//! for the same field. Only ids that pass these checks reach a player URL.

use reqwest::Url;
use serde::{Deserialize, Serialize};

const MAX_EMBEDDED_VIDEOS: usize = 10;
const YOUTUBE_HOSTS: &[&str] = &[
  "youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
];
const YOUTUBE_PATH_PREFIXES: &[&str] = &["embed", "shorts", "live", "v"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VideoProvider {
  YouTube,
  Vimeo,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EmbeddedVideo {
  pub provider: VideoProvider,
  pub id: String,
  /// Access hash that unlisted Vimeo videos need in the player URL
  pub hash: Option<String>,
}

fn is_youtube_id(id: &str) -> bool {
  id.len() == 11
    && id
      .bytes()
      .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
}

fn is_vimeo_id(id: &str) -> bool {
  !id.is_empty() && id.bytes().all(|byte| byte.is_ascii_digit())
}

fn is_vimeo_hash(hash: &str) -> bool {
  !hash.is_empty() && hash.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn query_value(url: &Url, key: &str) -> Option<String> {
  url
    .query_pairs()
    .find(|(name, _)| name == key)
    .map(|(_, value)| value.into_owned())
}

fn youtube(url: &Url, host: &str, segments: &[&str]) -> Option<EmbeddedVideo> {
  let id = if host == "youtu.be" {
    segments.first().map(|id| (*id).to_string())
  } else if YOUTUBE_HOSTS.contains(&host) {
    match segments {
      ["watch", ..] => query_value(url, "v"),
      [prefix, id, ..] if YOUTUBE_PATH_PREFIXES.contains(prefix) => Some((*id).to_string()),
      _ => None,
    }
  } else {
    None
  }?;
  is_youtube_id(&id).then_some(EmbeddedVideo {
    provider: VideoProvider::YouTube,
    id,
    hash: None,
  })
}

fn vimeo(url: &Url, host: &str, segments: &[&str]) -> Option<EmbeddedVideo> {
  let (id, hash) = match (host, segments) {
    ("player.vimeo.com", ["video", id, ..]) => (*id, query_value(url, "h")),
    // Unlisted videos carry their access hash as a second path segment
    ("vimeo.com", [id, rest @ ..]) => (*id, rest.first().map(|hash| (*hash).to_string())),
    _ => return None,
  };
  is_vimeo_id(id).then(|| EmbeddedVideo {
    provider: VideoProvider::Vimeo,
    id: id.to_string(),
    hash: hash.filter(|hash| is_vimeo_hash(hash)),
  })
}

fn embedded_video(raw: &str) -> Option<EmbeddedVideo> {
  let url = Url::parse(raw.trim()).ok()?;
  if !matches!(url.scheme(), "http" | "https") {
    return None;
  }
  let host = url.host_str()?.to_ascii_lowercase();
  let host = host.strip_prefix("www.").unwrap_or(&host);
  let segments: Vec<&str> = url
    .path_segments()
    .map(|segments| segments.collect())
    .unwrap_or_default();
  youtube(&url, host, &segments).or_else(|| {
    let segments: Vec<&str> = segments
      .into_iter()
      .filter(|segment| !segment.is_empty())
      .collect();
    vimeo(&url, host, &segments)
  })
}

/// Parses, de-duplicates, and caps the videos a submission embeds. A duplicate
/// that carries a Vimeo access hash upgrades an earlier entry without one.
pub fn embedded_videos(urls: &[String]) -> Vec<EmbeddedVideo> {
  let mut videos: Vec<EmbeddedVideo> = Vec::new();
  for video in urls.iter().filter_map(|url| embedded_video(url)) {
    let full = videos.len() >= MAX_EMBEDDED_VIDEOS;
    match videos
      .iter_mut()
      .find(|existing| existing.provider == video.provider && existing.id == video.id)
    {
      Some(existing) => {
        if existing.hash.is_none() {
          existing.hash = video.hash;
        }
      }
      None if !full => videos.push(video),
      None => {}
    }
  }
  videos
}

#[cfg(test)]
mod tests {
  use super::{EmbeddedVideo, VideoProvider, embedded_video, embedded_videos};

  fn youtube(id: &str) -> Option<EmbeddedVideo> {
    Some(EmbeddedVideo {
      provider: VideoProvider::YouTube,
      id: id.to_string(),
      hash: None,
    })
  }

  fn vimeo(id: &str, hash: Option<&str>) -> EmbeddedVideo {
    EmbeddedVideo {
      provider: VideoProvider::Vimeo,
      id: id.to_string(),
      hash: hash.map(str::to_string),
    }
  }

  #[test]
  fn reads_youtube_links() {
    for url in [
      "https://www.youtube.com/watch?v=Xw0wI89x3fc",
      "https://youtube.com/watch?v=Xw0wI89x3fc&t=42s",
      "https://m.youtube.com/watch?v=Xw0wI89x3fc",
      "https://youtu.be/Xw0wI89x3fc?si=abc",
      "https://www.youtube.com/shorts/Xw0wI89x3fc",
      "https://www.youtube.com/embed/Xw0wI89x3fc",
      "https://www.youtube.com/v/Xw0wI89x3fc",
      "https://www.youtube-nocookie.com/embed/Xw0wI89x3fc",
      "  https://www.youtube.com/live/Xw0wI89x3fc  ",
    ] {
      assert_eq!(embedded_video(url), youtube("Xw0wI89x3fc"), "{url}");
    }
  }

  #[test]
  fn reads_public_and_unlisted_vimeo_links() {
    assert_eq!(
      embedded_video("https://vimeo.com/1203014251"),
      Some(vimeo("1203014251", None))
    );
    assert_eq!(
      embedded_video("https://vimeo.com/1203014251/a1b2c3d4e5"),
      Some(vimeo("1203014251", Some("a1b2c3d4e5")))
    );
    assert_eq!(
      embedded_video("https://player.vimeo.com/video/1203014251?h=a1b2c3"),
      Some(vimeo("1203014251", Some("a1b2c3")))
    );
    assert_eq!(
      embedded_video("https://vimeo.com/123/<script>"),
      Some(vimeo("123", None))
    );
    assert_eq!(
      embedded_video("https://player.vimeo.com//video//1203014251?h=a1b2c3"),
      Some(vimeo("1203014251", Some("a1b2c3")))
    );
  }

  #[test]
  fn rejects_unsupported_links() {
    for url in [
      "not a url",
      "javascript:alert(1)",
      "https://evil.example/watch?v=Xw0wI89x3fc",
      "https://youtube.com.evil.example/watch?v=Xw0wI89x3fc",
      "https://www.youtube.com/watch?v=short",
      "https://www.youtube.com/watch?v=Xw0wI89x3fc%22onload%3D",
      "https://www.youtube.com/@channel",
      "https://youtube.com/embed//Xw0wI89x3fc",
      "https://youtube.com//watch?v=Xw0wI89x3fc",
      "https://youtu.be//Xw0wI89x3fc",
      "https://vimeo.com/channels/staffpicks",
      "ftp://vimeo.com/1203014251",
    ] {
      assert_eq!(embedded_video(url), None, "{url}");
    }
  }

  #[test]
  fn deduplicates_and_keeps_the_vimeo_hash() {
    let urls = [
      "https://vimeo.com/1203014251",
      "https://www.youtube.com/watch?v=Xw0wI89x3fc",
      "https://youtu.be/Xw0wI89x3fc",
      "https://example.com/video",
      "https://vimeo.com/1203014251/a1b2c3",
      "https://vimeo.com/1203014251",
    ]
    .map(str::to_string);
    assert_eq!(
      embedded_videos(&urls),
      [
        vimeo("1203014251", Some("a1b2c3")),
        youtube("Xw0wI89x3fc").unwrap(),
      ]
    );
  }

  #[test]
  fn caps_the_number_of_videos() {
    let urls: Vec<String> = (1..=12)
      .map(|id| format!("https://vimeo.com/{id}"))
      .collect();
    assert_eq!(embedded_videos(&urls).len(), 10);
  }
}
