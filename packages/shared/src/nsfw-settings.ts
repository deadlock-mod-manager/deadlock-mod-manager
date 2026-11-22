export type NSFWSettings = {
  hideNSFW: boolean;
  blurStrength: number;
  showLikelyNSFW: boolean;
  rememberPerItemOverrides: boolean;
  disableBlur: boolean;
};

export const DEFAULT_NSFW_SETTINGS: NSFWSettings = {
  hideNSFW: false,
  blurStrength: 16,
  showLikelyNSFW: false,
  rememberPerItemOverrides: true,
  disableBlur: false,
};
