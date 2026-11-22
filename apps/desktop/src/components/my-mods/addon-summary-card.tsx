import { Badge } from "@deadlock-mods/ui/components/badge";
import { XCircle } from "@deadlock-mods/ui/icons";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import { useVpkScan } from "@/hooks/use-vpk-scan";
import {
  isIdentifiedByNameOnly,
  isIgnoredByGame,
} from "@/lib/mods/analyzed-files";
import { usePersistedStore } from "@/lib/store";
import logger from "@/lib/logger";
import { gameBananaPageUrl } from "@/lib/mods/submission-ref";
import type { LocalAddonInfo } from "@/types/mods";
import type { AnalysisTarget } from "@/lib/store/slices/mods";
import { AddonInfo } from "./addon-info";
import { AddonActions } from "./addon-actions";
import { AddonFileActions } from "./addon-file-actions";

const openGameBananaPage = async (url: string) => {
  try {
    await openUrl(url);
  } catch (error) {
    logger.withError(error).error("Failed to open GameBanana link");
  }
};

export const AddonSummaryCard = ({
  addon,
  onAddToLibrary,
  fileContext,
}: {
  addon: LocalAddonInfo;
  onAddToLibrary?: (addon: LocalAddonInfo) => void;
  /** Without it (onboarding), the card offers no file actions. */
  fileContext?: AnalysisTarget | null;
}) => {
  const { t } = useTranslation();
  const { isLibraryVpk, isLoading: isLoadingSnapshot } = useVpkScan();
  const isIdentified = !!addon.remoteId;
  const ignoredByGame = isIgnoredByGame(addon);
  // An identified file counts as added once its mod is in the library, even
  // when the file isn't one of the mod's installed files (a parked VPK).
  const isModInLibrary = usePersistedStore((state) =>
    state.localMods.some((mod) => mod.remoteId === addon.remoteId),
  );
  const hasError = !addon.vpkParsed?.fingerprint;
  const activeProfileFolder = usePersistedStore(
    (state) => state.profiles[state.activeProfileId]?.folderName ?? null,
  );

  const owned = isLibraryVpk(addon.locator);
  // Wait for the snapshot; if it can't be read, Add reports the error itself.
  const isCheckingLibrary = owned === undefined && isLoadingSnapshot;

  // Every action waits for Analyze to finish registering, and acts only on the
  // analyzed profile.
  const locked =
    !!fileContext &&
    (fileContext.registering ||
      activeProfileFolder !== fileContext.profileFolder);

  const leftoverOf =
    isIdentifiedByNameOnly(addon) && !isModInLibrary
      ? addon.remoteId
      : undefined;
  // Only offered once the ownership snapshot says no library mod has the file.
  const fileActions =
    fileContext &&
    owned === false &&
    (leftoverOf || !isIdentified || ignoredByGame) ? (
      <AddonFileActions
        addon={addon}
        leftoverOf={leftoverOf}
        profileFolder={fileContext.profileFolder}
        disabled={locked}
      />
    ) : undefined;

  // Local mods are identified too, but have no GameBanana page to open.
  const gameBananaUrl = addon.remoteId
    ? gameBananaPageUrl(addon.remoteId)
    : null;

  if (hasError) {
    return (
      <div className='flex items-start justify-between p-4 border bg-muted/30 rounded-lg'>
        <div className='flex items-start gap-3'>
          <XCircle className='w-5 h-5 text-muted-foreground shrink-0 mt-0.5' />
          <div>
            <p className='font-medium text-sm'>{addon.fileName}</p>
            <p className='text-xs text-muted-foreground'>
              Failed to parse VPK file
            </p>
          </div>
        </div>
        <Badge variant='secondary' className='shrink-0 mt-0.5'>
          Error
        </Badge>
      </div>
    );
  }

  return (
    <div className='flex items-start justify-between p-4 border bg-muted/30 rounded-lg'>
      <div className='flex items-start gap-3 min-w-0 flex-1'>
        <div className='min-w-0 flex-1'>
          <p className='font-medium text-sm truncate'>{addon.fileName}</p>
          <AddonInfo addon={addon} isIdentified={isIdentified} />
          {ignoredByGame && (
            <div className='mt-1 space-y-0.5'>
              <p className='text-xs font-medium text-amber-600 dark:text-amber-400'>
                {t("addons.notLoadedByGame")}
              </p>
              <p className='text-xs text-muted-foreground'>
                {t("addons.notLoadedByGameDescription")}
              </p>
            </div>
          )}
        </div>
      </div>
      <div className='flex items-start gap-2 shrink-0 mt-0.5'>
        <AddonActions
          addon={addon}
          isIdentified={isIdentified}
          ignoredByGame={ignoredByGame}
          isAlreadyInLibrary={isIdentified ? isModInLibrary : owned === true}
          isCheckingLibrary={isCheckingLibrary || locked}
          onAddToLibrary={onAddToLibrary}
          onExternalLinkClick={
            gameBananaUrl ? () => openGameBananaPage(gameBananaUrl) : undefined
          }
          fileActions={fileActions}
        />
      </div>
    </div>
  );
};
