import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { readFile } from "@tauri-apps/plugin-fs";
import { useCallback, useEffect, useState } from "react";
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

const readDroppedFileFromPath = async (filePath: string): Promise<File> => {
  const bytes = await invoke<number[]>("read_dropped_mod_file", { filePath });
  const fileName =
    filePath.split("/").pop() ?? filePath.split("\\").pop() ?? "mod";

  return new File([new Uint8Array(bytes)], fileName);
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

        const decodedPath = decodeURIComponent(
          trimmedLine.startsWith("file://")
            ? trimmedLine.slice(7)
            : trimmedLine,
        );
        if (decodedPath) {
          extractedPaths.add(decodedPath);
        }
      }
      continue;
    }

    if (payload.type === "text/html") {
      const uriMatches = payload.value.match(/file:\/\/[^"'\s<>]+/g) ?? [];
      for (const uri of uriMatches) {
        const decodedPath = decodeURIComponent(uri.slice(7));
        if (decodedPath) {
          extractedPaths.add(decodedPath);
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

        if (trimmedLine.startsWith("file://")) {
          extractedPaths.add(decodeURIComponent(trimmedLine.slice(7)));
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
                        .map((uri) =>
                          decodeURIComponent(
                            uri.startsWith("file://") ? uri.slice(7) : uri,
                          ),
                        )
                    : extractedStringPaths;

                  const loadedFiles: File[] = [];
                  for (const filePath of paths) {
                    try {
                      loadedFiles.push(await readDroppedFileFromPath(filePath));
                    } catch (error) {
                      logger
                        .withMetadata({ filePath })
                        .withError(
                          error instanceof Error
                            ? error
                            : new Error(String(error)),
                        )
                        .warn("Failed to read file from dropped URI path");
                      // skip unreadable paths
                    }
                  }

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
        onError("Failed to read dropped files.");
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
          "Unsupported files. Please select VPK files or archives (ZIP, RAR, 7Z).",
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
          "Unsupported selection. Please select VPK files or archives (ZIP, RAR, 7Z).",
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
          name: "Mod Files",
          extensions: ["vpk", "zip", "rar", "7z"],
        },
      ],
    });

    if (!selected) return;

    const filePath = selected;
    const fileName =
      filePath.split("/").pop() ?? filePath.split("\\").pop() ?? "mod";

    try {
      const bytes = await readFile(filePath);
      const file = new File([bytes], fileName);
      const detectedSource = detectSource([file]);

      if (!detectedSource) {
        onError(
          "Unsupported selection. Please select VPK files or archives (ZIP, RAR, 7Z).",
        );
        return;
      }

      onFilesDetected(detectedSource);
    } catch {
      onError("Failed to read the selected file.");
    }
  }, [onFilesDetected, onError]);

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
