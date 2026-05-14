export function shouldShowNsfwBadgeAlongsideBlurPreview(args: {
  isNSFW: boolean;
  shouldBlur: boolean;
  disableBlur: boolean;
}): boolean {
  return args.isNSFW && (!args.shouldBlur || args.disableBlur);
}
