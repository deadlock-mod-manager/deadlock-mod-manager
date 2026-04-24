import type { ProfileModDownload } from "@deadlock-mods/shared";

const isHttpOrHttpsUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
};

export interface ProfileImportDownloadFile {
  url: string;
  name: string;
  size: number;
}

interface AvailableImportDownload {
  url: string;
  name: string;
  size?: number | null;
}

interface ResolveProfileImportDownloadFilesArgs {
  availableDownloads: AvailableImportDownload[];
  selectedDownloads?: ProfileModDownload[];
  selectedDownload?: ProfileModDownload;
}

export interface ResolvedProfileImportDownloadFiles {
  downloadFiles: ProfileImportDownloadFile[];
  missingSelectionNames: string[];
  resolvedWithLiveFallbackNames: string[];
  resolvedWithPersistedFallbackNames: string[];
}

const normalizeSelectedDownloads = (
  selectedDownloads?: ProfileModDownload[],
  selectedDownload?: ProfileModDownload,
): ProfileModDownload[] => {
  if (selectedDownloads?.length) {
    return selectedDownloads;
  }

  return selectedDownload ? [selectedDownload] : [];
};

const toImportDownloadFile = (
  download: AvailableImportDownload | ProfileModDownload,
): ProfileImportDownloadFile => ({
  url: download.url,
  name: "file" in download ? download.file : download.name,
  size: download.size ?? 0,
});

export const resolveProfileImportDownloadFiles = ({
  availableDownloads,
  selectedDownloads,
  selectedDownload,
}: ResolveProfileImportDownloadFilesArgs): ResolvedProfileImportDownloadFiles => {
  const persistedSelections = normalizeSelectedDownloads(
    selectedDownloads,
    selectedDownload,
  );

  if (persistedSelections.length === 0) {
    return {
      downloadFiles: availableDownloads
        .map(toImportDownloadFile)
        .filter((file) => file.url.length > 0),
      missingSelectionNames: [],
      resolvedWithLiveFallbackNames: [],
      resolvedWithPersistedFallbackNames: [],
    };
  }

  const availableDownloadsByName = new Map(
    availableDownloads.map((download) => [download.name, download]),
  );
  const missingSelectionNames: string[] = [];
  const resolvedWithLiveFallbackNames: string[] = [];
  const resolvedWithPersistedFallbackNames: string[] = [];
  const exactlyMatchedSelectionNames = new Set(
    persistedSelections
      .filter((selection) => availableDownloadsByName.has(selection.file))
      .map((selection) => selection.file),
  );
  const remainingAvailableDownloads = availableDownloads.filter(
    (download) => !exactlyMatchedSelectionNames.has(download.name),
  );
  const unmatchedSelections = persistedSelections.filter(
    (selection) => !availableDownloadsByName.has(selection.file),
  );

  const canResolveFromLiveDownloads =
    unmatchedSelections.length > 0 &&
    remainingAvailableDownloads.length === unmatchedSelections.length &&
    (unmatchedSelections.length === 1 ||
      persistedSelections.length === availableDownloads.length);
  const liveFallbackQueue = canResolveFromLiveDownloads
    ? [...remainingAvailableDownloads]
    : [];

  const downloadFiles = persistedSelections.flatMap((selection) => {
    const matchedDownload = availableDownloadsByName.get(selection.file);

    if (matchedDownload) {
      return [toImportDownloadFile(matchedDownload)];
    }

    missingSelectionNames.push(selection.file);

    const fallbackLiveDownload = liveFallbackQueue.shift();
    if (fallbackLiveDownload) {
      resolvedWithLiveFallbackNames.push(selection.file);
      return [toImportDownloadFile(fallbackLiveDownload)];
    }

    resolvedWithPersistedFallbackNames.push(selection.file);
    if (!isHttpOrHttpsUrl(selection.url)) {
      return [];
    }
    return [toImportDownloadFile(selection)];
  });

  return {
    downloadFiles,
    missingSelectionNames,
    resolvedWithLiveFallbackNames,
    resolvedWithPersistedFallbackNames,
  };
};
