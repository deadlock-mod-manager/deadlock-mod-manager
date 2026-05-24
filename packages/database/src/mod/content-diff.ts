import type { Mod } from "../schema/mods";

const arraysEqualIgnoringOrder = (
  left: readonly string[] | null | undefined,
  right: readonly string[] | null | undefined,
): boolean => {
  const sortedLeft = [...(left ?? [])].sort();
  const sortedRight = [...(right ?? [])].sort();

  return (
    sortedLeft.length === sortedRight.length &&
    sortedLeft.every((value, index) => value === sortedRight[index])
  );
};

const metadataEqual = (
  left: Mod["metadata"],
  right: Mod["metadata"],
): boolean => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

export const modContentDiffers = (before: Mod, after: Mod): boolean =>
  before.name !== after.name ||
  before.description !== after.description ||
  before.author !== after.author ||
  before.likes !== after.likes ||
  before.hero !== after.hero ||
  before.downloadCount !== after.downloadCount ||
  before.remoteUrl !== after.remoteUrl ||
  before.category !== after.category ||
  before.downloadable !== after.downloadable ||
  before.isNSFW !== after.isNSFW ||
  before.isObsolete !== after.isObsolete ||
  before.isMap !== after.isMap ||
  before.isAudio !== after.isAudio ||
  before.audioUrl !== after.audioUrl ||
  before.remoteAddedAt.getTime() !== after.remoteAddedAt.getTime() ||
  before.remoteUpdatedAt.getTime() !== after.remoteUpdatedAt.getTime() ||
  !arraysEqualIgnoringOrder(before.tags, after.tags) ||
  !arraysEqualIgnoringOrder(before.images, after.images) ||
  !metadataEqual(before.metadata, after.metadata);
