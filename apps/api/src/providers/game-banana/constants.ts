export const DEADLOCK_GAME_ID = 20_948; // {{base_url}}/Util/Game/NameMatch?_sName=Deadlock
export const MAPS_CATEGORY_NAME = "Maps";
export const GAME_BANANA_BASE_URL = "https://gamebanana.com/apiv11";
export const ACCEPTED_MODELS = ["Mod", "Sound"];

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
