import { createLogger } from "@/lib/logger";
import {
  detectSource,
  getFileBaseName,
  getFileName,
  type DetectedSource,
} from "./file-utils";

interface DroppedFileSourceResolvers {
  getFilesFromItems?: () => Promise<File[]>;
  getFilesFromUriList?: () => Promise<File[]>;
}

const logger = createLogger("dropped-file-source");

const summarizeFiles = (files: File[]) =>
  files.map((file) => ({
    baseName: getFileBaseName(file),
    name: file.name,
    resolvedName: getFileName(file),
    size: file.size,
    type: file.type || "unknown",
  }));

export const resolveDroppedModSource = async (
  initialFiles: File[],
  resolvers: DroppedFileSourceResolvers = {},
): Promise<DetectedSource | null> => {
  const initialSource = detectSource(initialFiles);
  if (initialSource) {
    logger
      .withMetadata({
        files: summarizeFiles(initialFiles),
        kind: initialSource.kind,
        source: "initial-files",
      })
      .info("Detected dropped mod source from initial files");
    return initialSource;
  }

  logger
    .withMetadata({
      files: summarizeFiles(initialFiles),
      hasItemsResolver: Boolean(resolvers.getFilesFromItems),
      hasUriListResolver: Boolean(resolvers.getFilesFromUriList),
    })
    .debug("Initial dropped files did not match a supported mod source");

  if (resolvers.getFilesFromItems) {
    const itemFiles = await resolvers.getFilesFromItems();
    const itemSource = detectSource(itemFiles);
    if (itemSource) {
      logger
        .withMetadata({
          files: summarizeFiles(itemFiles),
          kind: itemSource.kind,
          source: "data-transfer-items",
        })
        .info("Detected dropped mod source from data transfer items");
      return itemSource;
    }

    logger
      .withMetadata({
        files: summarizeFiles(itemFiles),
      })
      .debug("Data transfer items did not match a supported mod source");
  }

  if (resolvers.getFilesFromUriList) {
    const uriFiles = await resolvers.getFilesFromUriList();
    const uriSource = detectSource(uriFiles);
    if (uriSource) {
      logger
        .withMetadata({
          files: summarizeFiles(uriFiles),
          kind: uriSource.kind,
          source: "uri-list",
        })
        .info("Detected dropped mod source from URI list");
      return uriSource;
    }

    logger
      .withMetadata({
        files: summarizeFiles(uriFiles),
      })
      .warn("URI list fallback did not match a supported mod source");
  }

  logger.warn("Unable to detect a supported dropped mod source");
  return null;
};
