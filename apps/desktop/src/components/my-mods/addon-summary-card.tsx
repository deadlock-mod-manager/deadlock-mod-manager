import { Badge } from "@deadlock-mods/ui/components/badge";
import { XCircle } from "@deadlock-mods/ui/icons";
import { openUrl } from "@tauri-apps/plugin-opener";
import { usePersistedStore } from "@/lib/store";
import type { LocalAddonInfo } from "@/types/mods";
import { AddonInfo } from "./addon-info";
import { AddonActions } from "./addon-actions";

export const AddonSummaryCard = ({
  addon,
  onAddToLibrary,
}: {
  addon: LocalAddonInfo;
  onAddToLibrary?: (addon: LocalAddonInfo) => void;
}) => {
  const localMods = usePersistedStore((state) => state.localMods);
  const isIdentified = !!addon.remoteId;
  const hasError = !addon.vpkParsed?.fingerprint;

  // Check if this addon has already been added to the library
  const isAlreadyInLibrary = localMods.some((mod) =>
    mod.installedVpks?.includes(addon.filePath),
  );

  const handleExternalLinkClick = async () => {
    if (addon.remoteId) {
      try {
        // Construct GameBanana URL from remoteId
        const gameBananaUrl = `https://gamebanana.com/mods/${addon.remoteId}`;
        await openUrl(gameBananaUrl);
      } catch (error) {
        console.error("Failed to open GameBanana link:", error);
      }
    }
  };

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
        </div>
      </div>
      <div className='flex items-start gap-2 shrink-0 mt-0.5'>
        <AddonActions
          addon={addon}
          isIdentified={isIdentified}
          isAlreadyInLibrary={isAlreadyInLibrary}
          onAddToLibrary={onAddToLibrary}
          onExternalLinkClick={handleExternalLinkClick}
        />
      </div>
    </div>
  );
};
