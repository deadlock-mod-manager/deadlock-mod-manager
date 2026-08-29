import { BaseDirectory, exists, mkdir, writeFile } from "@tauri-apps/plugin-fs";
import { ARCHIVE_PATTERN, VPK_PATTERN } from "./file-patterns";

export interface FileSystemEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
  createReader?: () => DirectoryReader;
  file?: (callback: (file: File) => void) => void;
}

export interface DirectoryReader {
  readEntries: (callback: (entries: FileSystemEntry[]) => void) => void;
}

export type DataTransferItemWithEntry = DataTransferItem & {
  webkitGetAsEntry?: () => FileSystemEntry | null;
};

export type FileWithPath = File & {
  webkitRelativePath?: string;
};

export type BrowserFileSource = { type: "browserFile"; file: File };
export type NativePathSource = {
  type: "nativePath";
  path: string;
  fileName: string;
};
export type ImportSource = BrowserFileSource | NativePathSource;

export type DetectedSource =
  | { kind: "archive"; source: ImportSource }
  | { kind: "vpk"; source: ImportSource };

// A VPK already on disk, placed natively rather than read through the renderer.
export type StagedSource = { kind: "vpkPath"; path: string; fileName: string };

export type ModSource = DetectedSource | StagedSource;

export const MAX_BROWSER_MOD_FILE_BYTES = 64 * 1024 * 1024;

/**
 * File utility functions
 */
export const getFileName = (file: File): string =>
  (file as FileWithPath).webkitRelativePath || file.name;

export const getFileBaseName = (file: File): string => {
  const resolvedName = getFileName(file);
  const segments = resolvedName.split(/[\\/]/).filter(Boolean);

  return segments.at(-1) || file.name || "mod";
};

export const getImportSourceFileName = (source: ImportSource): string =>
  source.type === "nativePath" ? source.fileName : getFileBaseName(source.file);

export const exceedsBrowserModFileLimit = (source: DetectedSource): boolean =>
  source.source.type === "browserFile" &&
  source.source.file.size > MAX_BROWSER_MOD_FILE_BYTES;

export const fileToBytes = async (file: File): Promise<Uint8Array> =>
  new Uint8Array(await file.arrayBuffer());

export const ensureDirectory = async (absolutePath: string): Promise<void> => {
  if (!(await exists(absolutePath, { baseDir: BaseDirectory.AppLocalData }))) {
    await mkdir(absolutePath, {
      recursive: true,
      baseDir: BaseDirectory.AppLocalData,
    });
  }
};

export const writeFileBytes = async (
  absolutePath: string,
  data: Uint8Array,
): Promise<void> =>
  writeFile(absolutePath, data, { baseDir: BaseDirectory.AppLocalData });

export const writeFileText = async (
  absolutePath: string,
  text: string,
): Promise<void> =>
  writeFile(absolutePath, new TextEncoder().encode(text), {
    baseDir: BaseDirectory.AppLocalData,
  });

export const fileToDataUrl = (file: File): Promise<string> =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });

/**
 * Detects the source type from uploaded files
 */
const isAbsoluteLocalPath = (path: string | undefined): path is string =>
  Boolean(
    path &&
    (path.startsWith("/") ||
      path.startsWith("\\\\") ||
      path.startsWith("//") ||
      /^[a-zA-Z]:[\\/]/.test(path)),
  );

const getNativeFilePath = (file: File): string | null => {
  if (file.path && isAbsoluteLocalPath(file.path)) {
    return file.path;
  }

  return isAbsoluteLocalPath(file.webkitRelativePath)
    ? file.webkitRelativePath
    : null;
};

const detectSourceKind = (fileName: string): DetectedSource["kind"] | null => {
  if (VPK_PATTERN.test(fileName)) {
    return "vpk";
  }

  return ARCHIVE_PATTERN.test(fileName) ? "archive" : null;
};

export const detectPathSource = (paths: string[]): DetectedSource | null => {
  for (const kind of ["vpk", "archive"] as const) {
    for (const path of paths) {
      if (!isAbsoluteLocalPath(path)) {
        continue;
      }

      const fileName = path.split(/[\\/]/).filter(Boolean).at(-1) ?? "mod";
      if (detectSourceKind(fileName) === kind) {
        return {
          kind,
          source: { type: "nativePath", path, fileName },
        };
      }
    }
  }

  return null;
};

export const detectSource = (files: File[]): DetectedSource | null => {
  if (!files?.length) {
    return null;
  }

  const validFiles = files.filter(Boolean);
  const nativeSource = detectPathSource(
    validFiles.flatMap((file) => {
      const path = getNativeFilePath(file);
      return path ? [path] : [];
    }),
  );
  if (nativeSource) {
    return nativeSource;
  }

  const vpkFile = validFiles.find((file) =>
    VPK_PATTERN.test(getFileBaseName(file)),
  );

  if (vpkFile) {
    return {
      kind: "vpk",
      source: { type: "browserFile", file: vpkFile },
    };
  }

  const archiveFile = validFiles.find((file) =>
    ARCHIVE_PATTERN.test(getFileBaseName(file)),
  );
  if (archiveFile) {
    return {
      kind: "archive",
      source: { type: "browserFile", file: archiveFile },
    };
  }

  return null;
};

/**
 * Recursively reads files from DataTransfer items
 */
export const readFromDataTransferItems = async (
  items: ArrayLike<DataTransferItem>,
): Promise<File[]> => {
  const promises: Promise<File[]>[] = [];

  const processEntry = async (
    entry: FileSystemEntry,
    basePath = "",
  ): Promise<File[]> => {
    if (!entry) {
      return [];
    }

    if (entry.isFile && entry.file) {
      return new Promise<File[]>((resolve) => {
        entry.file!((file: File) => {
          const fileWithPath = file as FileWithPath;
          fileWithPath.webkitRelativePath = basePath + file.name;
          resolve([fileWithPath]);
        });
      });
    }

    if (entry.isDirectory && entry.createReader) {
      const reader = entry.createReader();
      return new Promise<File[]>((resolve) => {
        const allEntries: FileSystemEntry[] = [];

        const readEntries = (): void => {
          reader.readEntries(async (batch: FileSystemEntry[]) => {
            if (batch.length) {
              allEntries.push(...batch);
              readEntries();
            } else {
              const nestedFiles = await Promise.all(
                allEntries.map((e) =>
                  processEntry(e, `${basePath + entry.name}/`),
                ),
              );
              resolve(nestedFiles.flat());
            }
          });
        };

        readEntries();
      });
    }

    return [];
  };

  for (const item of Array.from(items)) {
    const typedItem = item as DataTransferItemWithEntry;
    const entry = typedItem.webkitGetAsEntry?.() ?? null;

    if (entry) {
      promises.push(processEntry(entry));
    } else if (item.kind === "file") {
      const file = item.getAsFile();
      if (file) {
        promises.push(Promise.resolve([file]));
      }
    }
  }

  const fileArrays = await Promise.all(promises);
  return fileArrays.flat();
};
