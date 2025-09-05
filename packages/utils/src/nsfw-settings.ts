// Simple NSFW settings types for frontend
export type NSFWSettings = {
  hideNSFW: boolean; // default: true
  blurStrength: number; // CSS pixels; default: 16
  showLikelyNSFW: boolean; // default: false
  rememberPerItemOverrides: boolean; // default: true
  disableBlur: boolean; // default: false - disable blurring NSFW content globally
};

// Default NSFW settings
export const DEFAULT_NSFW_SETTINGS: NSFWSettings = {
  hideNSFW: true,
  blurStrength: 16,
  showLikelyNSFW: false,
  rememberPerItemOverrides: true,
  disableBlur: false,
};
