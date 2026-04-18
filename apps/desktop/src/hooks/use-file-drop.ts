import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { resolveDroppedModSource } from "@/lib/dropped-file-source";
import { createLogger } from "@/lib/logger";
import {
  type DetectedSource,
  detectSource,
  getFileBaseName,
  getFileName,
  readFromDataTransferItems,
} from "@/lib/file-utils";

const logger = createLogger("use-file-drop");

interface PathBackedFile extends File {
  path?: string;
}

const summarizeFiles = (files: File[]) =>
  files.map((file) => ({
    baseName: getFileBaseName(file),
    name: file.name,
    resolvedName: getFileName(file),
    size: file.size,
    type: file.type || "unknown",
  }));

const summarizeItems = (items: DataTransferItem[]) =>
  items.map((item) => ({
    kind: item.kind,
    type: item.type || "unknown",
  }));

const readStringItem = (item: DataTransferItem): Promise<string> =>
  new Promise((resolve) => {
    item.getAsString((value) => resolve(value));
  });

const readStringPayloads = async (items: DataTransferItem[]) => {
  const stringItems = items.filter((item) => item.kind === "string");
  const payloads = await Promise.all(
    stringItems.map(async (item) => ({
      type: item.type || "unknown",
      value: await readStringItem(item),
    })),
  );

  return payloads.filter((payload) => payload.value.trim().length > 0);
};

const getPathFileName = (filePath: string): string =>
  filePath.split(/[\\/]/).filter(Boolean).at(-1) ?? "mod";

const createPathBackedFile = (filePath: string): File => {
  const file = new File([], getPathFileName(filePath)) as PathBackedFile;
  file.path = filePath;
  return file;
};

const parseFileUri = (value: string): string | null => {
  try {
    const url = new URL(value);
    if (url.protocol !== "file:") {
      return null;
    }

    const decodedPath = decodeURIComponent(url.pathname);
    const normalizedPath = /^\/[a-zA-Z]:\//.test(decodedPath)
      ? decodedPath.slice(1)
      : decodedPath;

    if (url.hostname && url.hostname !== "localhost") {
      return `//${url.hostname}${normalizedPath}`;
    }

    return normalizedPath;
  } catch {
    return null;
  }
};

const isAbsoluteLocalPath = (value: string): boolean => {
  if (value.startsWith("\\\\") || value.startsWith("//")) {
    return true;
  }
  if (value.startsWith("/")) {
    return true;
  }
  return /^[a-zA-Z]:[\\/]/.test(value);
};

const normalizeDroppedPath = (value: string): string | null => {
  if (!value) {
    return null;
  }

  if (value.startsWith("file://")) {
    return parseFileUri(value);
  }

  return isAbsoluteLocalPath(value) ? value : null;
};

const extractPathsFromStringPayloads = (
  payloads: Array<{ type: string; value: string }>,
): string[] => {
  const extractedPaths = new Set<string>();

  for (const payload of payloads) {
    if (payload.type === "text/uri-list") {
      for (const line of payload.value.split(/\r?\n/)) {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine.startsWith("#")) {
          continue;
        }

        const normalizedPath = normalizeDroppedPath(trimmedLine);
        if (normalizedPath) {
          extractedPaths.add(normalizedPath);
        }
      }
      continue;
    }

    if (payload.type === "text/html") {
      const uriMatches = payload.value.match(/file:\/\/[^"'\s<>]+/g) ?? [];
      for (const uri of uriMatches) {
        const normalizedPath = normalizeDroppedPath(uri);
        if (normalizedPath) {
          extractedPaths.add(normalizedPath);
        }
      }
      continue;
    }

    if (payload.type === "text/plain" || payload.type === "text/x-moz-url") {
      for (const line of payload.value.split(/\r?\n/)) {
        const trimmedLine = line.trim();
        if (!trimmedLine) {
          continue;
        }

        const normalizedPath = normalizeDroppedPath(trimmedLine);
        if (normalizedPath) {
          extractedPaths.add(normalizedPath);
        }
      }
    }
  }

  return Array.from(extractedPaths);
};

/**
 * Custom hook for handling file drag and drop functionality
 */
export const useFileDrop = (
  onFilesDetected: (source: DetectedSource) => void,
  onError: (message: string) => void,
) => {
  const [isDragging, setIsDragging] = useState(false);
  const { t } = useTranslation();

  const preventDefaults = useCallback((event: Event) => {
    event.preventDefault();
  }, []);

  useEffect(() => {
    // Prevent default drag behaviors on the entire window
    window.addEventListener("dragenter", preventDefaults, { passive: false });
    window.addEventListener("dragover", preventDefaults, { passive: false });
    window.addEventListener("drop", preventDefaults, { passive: false });

    return () => {
      window.removeEventListener("dragenter", preventDefaults);
      window.removeEventListener("dragover", preventDefaults);
      window.removeEventListener("drop", preventDefaults);
    };
  }, [preventDefaults]);

  const handleDragEnter = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    if (event.currentTarget === event.target) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const handleDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragging(false);

      const droppedFiles = Array.from(event.dataTransfer.files || []);
      const droppedItems = Array.from(event.dataTransfer.items || []);
      const droppedUriList = event.dataTransfer.getData("text/uri-list");
      const droppedTypes = Array.from(event.dataTransfer.types || []);

      logger
        .withMetadata({
          droppedFiles: summarizeFiles(droppedFiles),
          droppedItems: summarizeItems(droppedItems),
          droppedTypes,
          hasUriList: Boolean(droppedUriList),
          uriListLineCount: droppedUriList
            ? droppedUriList.split(/\r?\n/).filter(Boolean).length
            : 0,
        })
        .info("Local mod drop received");

      let detectedSource: DetectedSource | null;

      try {
        const stringPayloads = await readStringPayloads(droppedItems);
        const extractedStringPaths =
          extractPathsFromStringPayloads(stringPayloads);

        logger
          .withMetadata({
            stringPayloads: stringPayloads.map((payload) => ({
              type: payload.type,
              preview: payload.value.slice(0, 200),
            })),
            extractedStringPaths,
          })
          .debug("Read dropped string payloads");

        detectedSource = await resolveDroppedModSource(droppedFiles, {
          getFilesFromItems: droppedItems.length
            ? async () => {
                const filesFromItems =
                  await readFromDataTransferItems(droppedItems);
                logger
                  .withMetadata({
                    files: summarizeFiles(filesFromItems),
                    itemCount: droppedItems.length,
                  })
                  .debug("Resolved files from dropped data transfer items");
                return filesFromItems;
              }
            : undefined,
          getFilesFromUriList:
            droppedUriList || extractedStringPaths.length
              ? async () => {
                  const paths = droppedUriList
                    ? droppedUriList
                        .split(/\r?\n/)
                        .map((line) => line.trim())
                        .filter((line) => line && !line.startsWith("#"))
                        .map(normalizeDroppedPath)
                        .filter((path): path is string => Boolean(path))
                    : extractedStringPaths;

                  const loadedFiles = paths.map(createPathBackedFile);

                  logger
                    .withMetadata({
                      files: summarizeFiles(loadedFiles),
                      pathCount: paths.length,
                      paths,
                    })
                    .debug("Resolved files from dropped URI list");

                  return loadedFiles;
                }
              : undefined,
        });
      } catch (error) {
        logger
          .withError(error instanceof Error ? error : new Error(String(error)))
          .error("Failed to resolve dropped mod source");
        onError(t("addMods.failedToReadDroppedFiles"));
        return;
      }

      if (!detectedSource) {
        logger
          .withMetadata({
            droppedFiles: summarizeFiles(droppedFiles),
            droppedItems: summarizeItems(droppedItems),
            droppedTypes,
            hasUriList: Boolean(droppedUriList),
          })
          .warn("Dropped files were rejected as unsupported");
        onError(
          `${t("addMods.unsupportedFiles")} ${t("addMods.supportedFormats")}`,
        );
        return;
      }

      logger
        .withMetadata({
          detectedKind: detectedSource.kind,
          detectedFile: {
            baseName: getFileBaseName(detectedSource.file),
            name: detectedSource.file.name,
            resolvedName: getFileName(detectedSource.file),
            size: detectedSource.file.size,
            type: detectedSource.file.type || "unknown",
          },
        })
        .info("Dropped mod source accepted");

      onFilesDetected(detectedSource);
    },
    [onFilesDetected, onError],
  );

  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      const detectedSource = detectSource(files);

      if (!detectedSource) {
        onError(
          `${t("addMods.unsupportedSelection")} ${t("addMods.supportedFormats")}`,
        );
        return;
      }

      onFilesDetected(detectedSource);
    },
    [onFilesDetected, onError],
  );

  const openTauriFilePicker = useCallback(async () => {
    const selected = await openDialog({
      multiple: false,
      filters: [
        {
          name: t("common.mods"),
          extensions: ["vpk", "zip", "rar", "7z"],
        },
      ],
    });

    if (!selected) return;

    const filePath = selected;

    try {
      const file = createPathBackedFile(filePath);
      const detectedSource = detectSource([file]);

      if (!detectedSource) {
        onError(
          `${t("addMods.unsupportedSelection")} ${t("addMods.supportedFormats")}`,
        );
        return;
      }

      onFilesDetected(detectedSource);
    } catch {
      onError(t("addMods.failedToReadSelectedFile"));
    }
  }, [onFilesDetected, onError, t]);

  return {
    isDragging,
    dragHandlers: {
      onDragEnter: handleDragEnter,
      onDragLeave: handleDragLeave,
      onDragOver: handleDragOver,
      onDrop: handleDrop,
    },
    onFileSelect: handleFileSelect,
    openTauriFilePicker,
  };
};
