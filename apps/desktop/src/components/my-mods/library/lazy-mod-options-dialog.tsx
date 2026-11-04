import { ModOptionsDialog } from "@/components/mod-management/mod-options-dialog";
import { useModOptions } from "@/hooks/use-mod-options";
import { useHasOpened } from "@deadlock-mods/ui/hooks/use-has-opened";

// Rendered outside ModContextMenu so events from the portalled dialog don't
// bubble into the card's context menu trigger.
export const LazyModOptionsDialog = ({
  modOptions,
  modName,
}: {
  modOptions: ReturnType<typeof useModOptions>;
  modName: string;
}) => {
  const opened = useHasOpened(modOptions.isOpen);
  if (!modOptions.showButton || !opened) {
    return null;
  }
  return (
    <ModOptionsDialog
      isOpen={modOptions.isOpen}
      onOpenChange={(open) => (open ? modOptions.open() : modOptions.close())}
      isSaving={modOptions.isSaving}
      onCancelApply={modOptions.cancelApply}
      progress={modOptions.progress}
      onApply={modOptions.apply}
      fileTree={modOptions.fileTree}
      onApplyFiles={modOptions.applyFileSelection}
      isSavingFiles={modOptions.isSavingFiles}
      modName={modName}
      downloads={modOptions.downloads}
      onDiskArchiveNames={modOptions.onDiskArchiveNames}
      activeArchiveNames={modOptions.activeArchiveNames}
    />
  );
};
