type NSFWItem = {
  isNSFW: boolean;
};

type NSFWBlurState = NSFWItem & {
  isVisibleOverride: boolean | undefined;
  rememberOverrides: boolean;
};

/**
 * Removes NSFW items when the user enabled global NSFW hiding.
 * Preserves `undefined` input and returns the list unchanged when hiding is
 * disabled.
 */
export const filterHiddenNSFWItems = <T extends NSFWItem>(
  items: T[] | undefined,
  hideNSFW: boolean,
): T[] | undefined => {
  if (!items || !hideNSFW) return items;

  return items.filter((item) => !item.isNSFW);
};

/**
 * Determines whether an item's preview must be blurred. Non-NSFW items are
 * never blurred. A remembered per-item override takes precedence only when
 * `rememberOverrides` is enabled; otherwise NSFW items blur by default.
 */
export const shouldBlurNSFWItem = ({
  isNSFW,
  isVisibleOverride,
  rememberOverrides,
}: NSFWBlurState): boolean => {
  if (!isNSFW) return false;
  if (rememberOverrides && isVisibleOverride !== undefined) {
    return !isVisibleOverride;
  }

  // Blur by default, even for globally hidden items that leak onto
  // surfaces without global NSFW filtering.
  return true;
};
