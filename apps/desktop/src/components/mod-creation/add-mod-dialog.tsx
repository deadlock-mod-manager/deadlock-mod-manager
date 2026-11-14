import { Dialog, DialogContent } from "@deadlock-mods/ui/components/dialog";
import { AddModDetails } from "@/components/mod-creation/add-mod-details";
import { AddModDropZone } from "@/components/mod-creation/add-mod-drop-zone";
import { useAddModDialog } from "@/lib/add-mod-dialog";
import { discardStagedDrops } from "@/lib/file-utils";
import logger from "@/lib/logger";

/**
 * Adds mods from files on disk: asks for files, then for the mod's details.
 * Files dropped anywhere in the window open it on the details step.
 */
export const AddModDialog = () => {
  const { open, source, session, show, setSource, close } = useAddModDialog();

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) return;
    close();
    discardStagedDrops().catch((error) =>
      logger.withError(error).warn("Failed to discard staged drop"),
    );
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className={source ? "max-w-4xl" : "max-w-xl"}>
        {source ? (
          <AddModDetails
            key={session}
            onClose={() => handleOpenChange(false)}
            onSourceChange={setSource}
            source={source}
          />
        ) : (
          <AddModDropZone onSource={show} />
        )}
      </DialogContent>
    </Dialog>
  );
};
