export const countAppDownloads = (
  versions: ReadonlyArray<{
    downloads: ReadonlyArray<{ downloadCount: number }>;
  }>,
): number =>
  versions.reduce(
    (total, version) =>
      total +
      version.downloads.reduce(
        (versionTotal, download) => versionTotal + download.downloadCount,
        0,
      ),
    0,
  );
