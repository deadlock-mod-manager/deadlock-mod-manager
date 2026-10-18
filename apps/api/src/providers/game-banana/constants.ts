export const DEADLOCK_GAME_ID = 20_948; // {{base_url}}/Util/Game/NameMatch?_sName=Deadlock
export const MAPS_CATEGORY_NAME = "Maps";
export const GAME_BANANA_BASE_URL = "https://gamebanana.com/apiv11";
export const ACCEPTED_MODELS = ["Mod", "Sound"];
// GameBanana rate limits are aggressive, so pages are as large as the index
// allows: about 190 requests walk every mod and sound
export const INDEX_PAGE_SIZE = 50;
// Profiles re-fetched per sync regardless of the index: likes and download
// counts don't move the index timestamp, and trashed or deleted submissions
// can drop out of the index. At a 15 minute schedule this revisits every mod
// about once a day.
export const SYNC_REFRESH_BATCH_SIZE = 100;

// Sexual and suggestive content ratings. Crude language, gore, and other ratings
// stay visible on GameBanana, so they are not NSFW here either. Mirrors
// NSFW_CONTENT_RATINGS in apps/desktop/src-tauri/src/providers/gamebanana/normalization.rs.
export const NSFW_CONTENT_RATINGS = {
  st: "Sexual Themes",
  sa: "Skimpy Attire",
  sc: "Sexual Content",
  ft: "Fetishistic",
  lp: "Lewd Angles & Poses",
  pn: "Partial Nudity",
  nu: "Full Nudity",
};

// GameBanana hides or warns exactly for the ratings above.
export const NSFW_VISIBILITIES = ["hide", "warn"];
