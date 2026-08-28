import {
  type DetectedSource,
  detectPathSource,
  detectSource,
} from "./file-utils";

interface DroppedFileSourceResolvers {
  getFilesFromItems?: () => Promise<File[]>;
  getPathsFromUriList?: () => Promise<string[]>;
}

export const resolveDroppedModSource = async (
  initialFiles: File[],
  resolvers: DroppedFileSourceResolvers = {},
): Promise<DetectedSource | null> => {
  const initialSource = detectSource(initialFiles);
  if (initialSource?.source.type === "nativePath") {
    return initialSource;
  }

  let browserFallback = initialSource;

  if (resolvers.getFilesFromItems) {
    const itemSource = detectSource(await resolvers.getFilesFromItems());
    if (itemSource?.source.type === "nativePath") {
      return itemSource;
    }
    browserFallback ??= itemSource;
  }

  if (resolvers.getPathsFromUriList) {
    const uriSource = detectPathSource(await resolvers.getPathsFromUriList());
    if (uriSource) {
      return uriSource;
    }
  }

  return browserFallback;
};
