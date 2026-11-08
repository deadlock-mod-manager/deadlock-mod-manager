import type { EmbeddedVideo } from "./types/mod-metadata";

const YOUTUBE_ID = /^[\w-]{11}$/;
const VIMEO_ID = /^\d+$/;
const VIMEO_HASH = /^[\da-f]+$/i;
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
]);
const YOUTUBE_PATH_PREFIXES = new Set(["embed", "shorts", "live", "v"]);

function parseYouTube(url: URL, host: string): EmbeddedVideo | null {
  let id: string | null | undefined;
  if (host === "youtu.be") {
    id = url.pathname.split("/")[1];
  } else if (YOUTUBE_HOSTS.has(host)) {
    const [, first, second] = url.pathname.split("/");
    id =
      first === "watch"
        ? url.searchParams.get("v")
        : first && YOUTUBE_PATH_PREFIXES.has(first)
          ? second
          : null;
  }
  return id && YOUTUBE_ID.test(id) ? { provider: "youtube", id } : null;
}

function parseVimeo(url: URL, host: string): EmbeddedVideo | null {
  const segments = url.pathname.split("/").filter(Boolean);
  let id: string | undefined;
  let hash: string | null | undefined;
  if (host === "player.vimeo.com" && segments[0] === "video") {
    id = segments[1];
    hash = url.searchParams.get("h");
  } else if (host === "vimeo.com") {
    // Unlisted videos carry their access hash as a second path segment
    [id, hash] = segments;
  }
  if (!id || !VIMEO_ID.test(id)) return null;
  return hash && VIMEO_HASH.test(hash)
    ? { provider: "vimeo", id, hash }
    : { provider: "vimeo", id };
}

/**
 * Resolves a video page link (as GameBanana lists them in `_aEmbeddedMedia`)
 * to a provider and video id. Returns null for unsupported hosts so callers
 * never build iframe URLs from unvalidated input.
 */
export function parseEmbeddedVideo(rawUrl: string): EmbeddedVideo | null {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  return parseYouTube(url, host) ?? parseVimeo(url, host);
}

/** Parses, de-duplicates, and caps the videos a submission embeds. */
export function parseEmbeddedVideos(
  urls: readonly string[],
  limit = 10,
): EmbeddedVideo[] {
  const videos = new Map<string, EmbeddedVideo>();
  for (const url of urls) {
    const video = parseEmbeddedVideo(url);
    if (video) videos.set(`${video.provider}:${video.id}`, video);
    if (videos.size >= limit) break;
  }
  return [...videos.values()];
}
