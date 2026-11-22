import { getMod, getModDownloads } from "@/lib/api-client";
import logger from "@/lib/logger";
import { resolveProfileImportDownloadFiles } from "@/lib/profiles/import-downloads";
import type {
  AvailableImportedMod,
  FetchModsDataEntry,
  FetchModsDataResult,
  PrepareProfileImportEntry,
  PreparedProfileImport,
  PreparedProfileImportMod,
  ProfileImportDownloadFile,
} from "@/lib/profiles/types";
import type { ModDownloadItem } from "@/types/mods";

/** The catalog entry of each file the import fetches. A file only the share
 *  still names keeps its name, URL and size, without catalog metadata. */
const toSelectedDownloads = (
  downloadFiles: ProfileImportDownloadFile[],
  availableDownloads: ModDownloadItem[],
): ModDownloadItem[] =>
  downloadFiles.map(
    (file) =>
      availableDownloads.find(
        (download) => download.url === file.url && download.name === file.name,
      ) ?? {
        url: file.url,
        name: file.name,
        size: file.size,
        description: null,
        createdAt: null,
        updatedAt: null,
        md5Checksum: null,
      },
  );

export const fetchModsData = async (
  remoteIds: string[],
): Promise<FetchModsDataResult> => {
  const results: FetchModsDataEntry[] = await Promise.all(
    Array.from(new Set(remoteIds)).map(async (remoteId) => {
      try {
        return {
          remoteId,
          modData: await getMod(remoteId),
        };
      } catch (error) {
        return {
          remoteId,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );

  return results.reduce<FetchModsDataResult>(
    (accumulator, result) => {
      if ("modData" in result) {
        accumulator.modsData.push(result.modData);
      } else {
        accumulator.failed.push([result.remoteId, result.error]);
      }

      return accumulator;
    },
    { modsData: [], failed: [] },
  );
};

export const prepareProfileImportMods = async (
  availableImportedMods: AvailableImportedMod[],
): Promise<PreparedProfileImport> => {
  const results: PrepareProfileImportEntry[] = await Promise.all(
    availableImportedMods.map(async ({ importedMod, modData }) => {
      try {
        const downloadsResponse = await getModDownloads(modData.remoteId);
        const downloadFiles = downloadsResponse.downloads || [];

        const resolvedDownloadFiles = resolveProfileImportDownloadFiles({
          availableDownloads: downloadFiles,
          selectedDownloads: importedMod.selectedDownloads,
          selectedDownload: importedMod.selectedDownload,
        });

        if (resolvedDownloadFiles.downloadFiles.length === 0) {
          throw new Error("No download files available for import");
        }

        if (resolvedDownloadFiles.resolvedWithLiveFallbackNames.length > 0) {
          logger
            .withMetadata({
              modId: modData.remoteId,
              modName: modData.name,
              renamedSelectionNames:
                resolvedDownloadFiles.resolvedWithLiveFallbackNames,
              availableDownloadCount: downloadFiles.length,
            })
            .warn(
              "Using current live download entries for renamed imported selections",
            );
        }

        if (
          resolvedDownloadFiles.resolvedWithPersistedFallbackNames.length > 0
        ) {
          logger
            .withMetadata({
              modId: modData.remoteId,
              modName: modData.name,
              missingSelectionNames:
                resolvedDownloadFiles.resolvedWithPersistedFallbackNames,
              availableDownloadCount: downloadFiles.length,
            })
            .warn("Falling back to persisted imported download selection");
        }

        return {
          importedMod,
          modData,
          profileImportMod: {
            modId: modData.remoteId,
            modName: modData.name,
            downloadFiles: resolvedDownloadFiles.downloadFiles.map(
              (download) => ({
                url: download.url,
                name: download.name,
                size: download.size,
              }),
            ),
            fileTree: importedMod.fileTree
              ? {
                  ...importedMod.fileTree,
                  files: importedMod.fileTree.files.some(
                    (file) => file.is_selected,
                  )
                    ? importedMod.fileTree.files
                    : importedMod.fileTree.files.map((file) => ({
                        ...file,
                        is_selected: true,
                      })),
                }
              : undefined,
            isMap: modData.isMap,
          },
          downloads: {
            downloads: downloadFiles,
            selectedDownloads: toSelectedDownloads(
              resolvedDownloadFiles.downloadFiles,
              downloadFiles,
            ),
          },
        } satisfies PreparedProfileImportMod;
      } catch (error) {
        return {
          importedMod,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );

  return results.reduce<PreparedProfileImport>(
    (accumulator, result) => {
      if ("profileImportMod" in result) {
        accumulator.preparedMods.push(result);
      } else {
        accumulator.failed.push([result.importedMod.remoteId, result.error]);
      }

      return accumulator;
    },
    { preparedMods: [], failed: [] },
  );
};
