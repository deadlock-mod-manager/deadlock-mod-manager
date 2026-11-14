import { Dialog, DialogContent } from "@deadlock-mods/ui/components/dialog";
import { useIsMutating } from "@tanstack/react-query";
import { AddModDetails } from "@/components/mod-creation/add-mod-details";
import { AddModDropZone } from "@/components/mod-creation/add-mod-drop-zone";
import { IMPORT_MODS_KEY, useAddModDialog } from "@/lib/add-mod-dialog";
import { discardStagedDrops } from "@/lib/file-utils";
import logger from "@/lib/logger";

/**
 * Adds mods from files on disk: asks for files, then for the mod's details.
 * Files dropped anywhere in the window open it on the details step.
 */
export const AddModDialog = () => {
  const { open, source, session, show, setSource, close } = useAddModDialog();
  const importing = useIsMutating({ mutationKey: IMPORT_MODS_KEY }) > 0;

  const closeAndDiscard = () => {
    close();
    discardStagedDrops().catch((error) =>
      logger.withError(error).warn("Failed to discard staged drop"),
    );
  };

  return (
    <Dialog
      // An import still reads the staged files that closing deletes.
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !importing) closeAndDiscard();
      }}
      open={open}>
      <DialogContent className={source ? "max-w-4xl" : "max-w-xl"}>
        {source ? (
          <AddModDetails
            key={session}
            onClose={closeAndDiscard}
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
