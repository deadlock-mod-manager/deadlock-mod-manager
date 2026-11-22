import { ValidationError } from "@deadlock-mods/common/client-errors";
import {
  type DetectedSource,
  combinesArchives,
  detectSource,
} from "./file-utils";

interface DroppedFileSourceResolvers {
  getFilesFromItems?: () => Promise<File[]>;
  getFilesFromUriList?: () => Promise<File[]>;
}

export class CombinedArchiveError extends ValidationError {
  constructor() {
    super("An archive can't be added with other mod files");
  }
}

// Checked on every list a drop can resolve to, not only the first one.
const detect = (files: File[]): DetectedSource | null => {
  if (combinesArchives(files)) throw new CombinedArchiveError();
  return detectSource(files);
};

export const resolveDroppedModSource = async (
  initialFiles: File[],
  resolvers: DroppedFileSourceResolvers = {},
): Promise<DetectedSource | null> => {
  const initialSource = detect(initialFiles);
  if (initialSource) {
    return initialSource;
  }

  if (resolvers.getFilesFromItems) {
    const itemSource = detect(await resolvers.getFilesFromItems());
    if (itemSource) {
      return itemSource;
    }
  }

  if (resolvers.getFilesFromUriList) {
    const uriSource = detect(await resolvers.getFilesFromUriList());
    if (uriSource) {
      return uriSource;
    }
  }

  return null;
};
