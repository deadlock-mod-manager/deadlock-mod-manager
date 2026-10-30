import { appLocalDataDir, join } from "@tauri-apps/api/path";
import {
  BaseDirectory,
  exists,
  mkdir,
  remove,
  writeFile,
} from "@tauri-apps/plugin-fs";
import { ARCHIVE_PATTERN, VPK_PATTERN } from "./file-patterns";
import { getRuntimeBootstrap } from "./runtime-bootstrap";

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

export type DetectedSource =
  | { kind: "archive"; file: File }
  | { kind: "vpk"; file: File };

// A VPK already on disk, placed natively rather than read through the renderer.
export type StagedSource = { kind: "vpkPath"; path: string; fileName: string };

/** The live bridge HUD mod, built from the installed game by the backend. */
type LiveBridgeSource = { kind: "liveBridge" };

export type ModSource = DetectedSource | StagedSource | LiveBridgeSource;

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

export const fileToBytes = async (file: File): Promise<Uint8Array> =>
  new Uint8Array(await file.arrayBuffer());

// A file on disk known only by its path, from the picker or a staged drop.
type PathBackedFile = File & { path?: string };

export const createPathBackedFile = (filePath: string): File => {
  const fileName = filePath.split(/[\\/]/).filter(Boolean).at(-1) ?? "mod";
  const file = new File([], fileName) as PathBackedFile;
  file.path = filePath;
  return file;
};

export const getSourceFilePath = (file: File): string | null => {
  const filePath = (file as PathBackedFile).path;
  return typeof filePath === "string" && filePath.length > 0 ? filePath : null;
};

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

const WRITE_CHUNK_BYTES = 8 * 1024 * 1024;

// Written in slices: a mod can be close to a gigabyte, and holding it whole in
// the renderer, then sending it in one IPC body, can crash the webview.
export const writeFileInChunks = async (
  absolutePath: string,
  file: Blob,
  onProgress?: (written: number, total: number) => void,
): Promise<void> => {
  let offset = 0;
  do {
    const chunk = await file
      .slice(offset, offset + WRITE_CHUNK_BYTES)
      .arrayBuffer();
    await writeFile(absolutePath, new Uint8Array(chunk), {
      append: offset > 0,
      baseDir: BaseDirectory.AppLocalData,
    });
    offset += WRITE_CHUNK_BYTES;
    onProgress?.(Math.min(offset, file.size), file.size);
  } while (offset < file.size);
};

const stagedDropsDirectory = async (): Promise<string> =>
  join(
    (await getRuntimeBootstrap()).appDataPath ?? (await appLocalDataDir()),
    "dropped-mods",
  );

export const discardStagedDrops = async (): Promise<void> => {
  const directory = await stagedDropsDirectory();
  if (await exists(directory, { baseDir: BaseDirectory.AppLocalData })) {
    await remove(directory, {
      recursive: true,
      baseDir: BaseDirectory.AppLocalData,
    });
  }
};

/**
 * Flushes a dropped file to disk as soon as it is dropped, so the rest of the
 * import handles it by path, like a file chosen in the picker. Only the latest
 * drop is kept.
 */
export const stageDroppedFile = async (
  file: File,
  onProgress?: (written: number, total: number) => void,
): Promise<File> => {
  await discardStagedDrops();
  const directory = await stagedDropsDirectory();
  await ensureDirectory(directory);
  const stagedPath = await join(directory, getFileBaseName(file));
  await writeFileInChunks(stagedPath, file, onProgress);
  return createPathBackedFile(stagedPath);
};

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
export const detectSource = (files: File[]): DetectedSource | null => {
  if (!files?.length) {
    return null;
  }

  const validFiles = files.filter(Boolean);
  const vpkFile = validFiles.find((file) =>
    VPK_PATTERN.test(getFileBaseName(file)),
  );

  if (vpkFile) {
    return { kind: "vpk", file: vpkFile };
  }

  const archiveFile = validFiles.find((file) =>
    ARCHIVE_PATTERN.test(getFileBaseName(file)),
  );
  if (archiveFile) {
    return { kind: "archive", file: archiveFile };
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
