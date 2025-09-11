import { BaseDirectory, exists, mkdir, writeFile } from '@tauri-apps/plugin-fs';
import { ARCHIVE_PATTERN, VPK_PATTERN } from './file-patterns';

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
  | { kind: 'archive'; file: File }
  | { kind: 'vpk'; file: File };

/**
 * File utility functions
 */
export const getFileName = (file: File): string =>
  (file as FileWithPath).webkitRelativePath || file.name;

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
  data: Uint8Array
): Promise<void> =>
  writeFile(absolutePath, data, { baseDir: BaseDirectory.AppLocalData });

export const writeFileText = async (
  absolutePath: string,
  text: string
): Promise<void> =>
  writeFile(absolutePath, new TextEncoder().encode(text), {
    baseDir: BaseDirectory.AppLocalData,
  });

export const fileToDataUrl = (file: File): Promise<string> =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
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
  const vpkFile = validFiles.find((file) => VPK_PATTERN.test(file.name));

  if (validFiles.length === 1 && vpkFile) {
    return { kind: 'vpk', file: vpkFile };
  }

  const archiveFile = validFiles.find((file) =>
    ARCHIVE_PATTERN.test(file.name)
  );
  if (validFiles.length === 1 && archiveFile) {
    return { kind: 'archive', file: archiveFile };
  }

  return null;
};

/**
 * Recursively reads files from DataTransfer items
 */
export const readFromDataTransferItems = async (
  items: DataTransferItemList
): Promise<File[]> => {
  const promises: Promise<File[]>[] = [];

  const processEntry = async (
    entry: FileSystemEntry,
    basePath = ''
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
                  processEntry(e, `${basePath + entry.name}/`)
                )
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
    } else if (item.kind === 'file') {
      const file = item.getAsFile();
      if (file) {
        promises.push(Promise.resolve([file]));
      }
    }
  }

  const fileArrays = await Promise.all(promises);
  return fileArrays.flat();
};
