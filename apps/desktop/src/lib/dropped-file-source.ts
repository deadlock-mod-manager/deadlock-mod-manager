import { type DetectedSource, detectSource } from "./file-utils";

interface DroppedFileSourceResolvers {
  getFilesFromItems?: () => Promise<File[]>;
  getFilesFromUriList?: () => Promise<File[]>;
}

export const resolveDroppedModSource = async (
  initialFiles: File[],
  resolvers: DroppedFileSourceResolvers = {},
): Promise<DetectedSource | null> => {
  const initialSource = detectSource(initialFiles);
  if (initialSource) {
    return initialSource;
  }

  if (resolvers.getFilesFromItems) {
    const itemSource = detectSource(await resolvers.getFilesFromItems());
    if (itemSource) {
      return itemSource;
    }
  }

  if (resolvers.getFilesFromUriList) {
    const uriSource = detectSource(await resolvers.getFilesFromUriList());
    if (uriSource) {
      return uriSource;
    }
  }

  return null;
};
