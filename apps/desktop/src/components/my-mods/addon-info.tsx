import type { LocalAddonInfo } from "@/types/mods";
import { VpkEntriesDisplay } from "./vpk-entries-display";

interface AddonInfoProps {
  addon: LocalAddonInfo;
  isIdentified: boolean;
}

export const AddonInfo = ({ addon, isIdentified }: AddonInfoProps) => {
  if (isIdentified) {
    // Check if this is a prefixed VPK (has remoteId but no matchInfo)
    if (addon.remoteId && !addon.matchInfo) {
      return (
        <div className='space-y-1'>
          <p className='text-xs text-foreground font-medium'>
            Downloaded Mod (ID: {addon.remoteId})
          </p>
          <p className='text-xs text-muted-foreground'>
            Currently disabled - ready to enable
          </p>
        </div>
      );
    }

    return (
      <div className='space-y-1'>
        <p className='text-xs text-foreground font-medium'>
          {addon.matchInfo?.modName}
        </p>
        <p className='text-xs text-muted-foreground'>
          {addon.matchInfo?.modAuthor && `by ${addon.matchInfo.modAuthor} • `}
          {addon.matchInfo?.certainty}% match
        </p>
      </div>
    );
  }

  return (
    <div className='space-y-2'>
      <p className='text-xs text-muted-foreground'>
        {(addon.vpkParsed.fingerprint.fileSize / 1024 / 1024).toFixed(1)} MB •{" "}
        {addon.vpkParsed.fingerprint.fileCount} files
      </p>
      {addon.vpkParsed.entries && addon.vpkParsed.entries.length > 0 && (
        <VpkEntriesDisplay entries={addon.vpkParsed.entries} />
      )}
    </div>
  );
};
