type NSFWItem = {
  isNSFW: boolean;
};

type NSFWBlurState = NSFWItem & {
  isVisibleOverride: boolean | undefined;
};

export const filterHiddenNSFWItems = <T extends NSFWItem>(
  items: T[] | undefined,
  hideNSFW: boolean,
): T[] | undefined => {
  if (!items || !hideNSFW) return items;

  return items.filter((item) => !item.isNSFW);
};

export const shouldBlurNSFWItem = ({
  isNSFW,
  isVisibleOverride,
}: NSFWBlurState): boolean => {
  if (!isNSFW) return false;
  if (isVisibleOverride !== undefined) return !isVisibleOverride;

  // Blur by default, even for globally hidden items that leak onto
  // surfaces without global NSFW filtering.
  return true;
};
