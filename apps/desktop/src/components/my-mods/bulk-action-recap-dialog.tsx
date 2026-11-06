import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { CheckCircle, CircleSlash, XCircle } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { asItems, RecapSection } from "@/components/my-mods/recap-section";
import type { BulkActionRecap } from "@/lib/mods/bulk-action";

const COPY = {
  disable: {
    title: "myMods.bulkActionRecap.disableTitle",
    summary: "myMods.bulkActionRecap.disableSummary",
    failed: "myMods.bulkActionRecap.disableFailed",
    completed: "myMods.bulkActionRecap.disabled",
  },
  delete: {
    title: "myMods.bulkActionRecap.deleteTitle",
    summary: "myMods.bulkActionRecap.deleteSummary",
    failed: "myMods.bulkActionRecap.deleteFailed",
    completed: "myMods.bulkActionRecap.deleted",
  },
} as const;

const STOP_REASON = {
  error: "myMods.bulkActionRecap.stoppedError",
  gameRunning: "myMods.bulkActionRecap.stoppedGameRunning",
  profileChanged: "myMods.bulkActionRecap.stoppedProfileChanged",
} as const;

type BulkActionRecapDialogProps = {
  recap: BulkActionRecap | null;
  onClose: () => void;
};

/** Shown when a bulk disable or delete stops before reaching every mod. */
export const BulkActionRecapDialog = ({
  recap,
  onClose,
}: BulkActionRecapDialogProps) => {
  const { t } = useTranslation();
  if (!recap?.stoppedBy) return null;

  const copy = COPY[recap.action];
  const total =
    recap.completed.length + (recap.failed ? 1 : 0) + recap.notAttempted.length;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='flex max-h-[80vh] max-w-xl flex-col'>
        <DialogHeader>
          <DialogTitle>{t(copy.title)}</DialogTitle>
          <DialogDescription>
            {t(copy.summary, {
              completed: recap.completed.length,
              count: total,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className='-mx-1 min-h-0 flex-1 space-y-5 overflow-y-auto px-1'>
          {/* After a failure on the last mod nothing was left to skip. */}
          {(recap.stoppedBy !== "error" || recap.notAttempted.length > 0) && (
            <p className='rounded-md bg-muted p-3 text-sm text-muted-foreground'>
              {t(STOP_REASON[recap.stoppedBy])}
            </p>
          )}
          {/* Purge removes a mod's VPKs before its stored files, so a failed
              delete can leave it half removed. Disable rolls its renames back. */}
          {recap.action === "delete" && recap.failed && (
            <p className='rounded-md bg-muted p-3 text-sm text-muted-foreground'>
              {t("myMods.bulkActionRecap.deletePartial")}
            </p>
          )}
          <RecapSection
            icon={<XCircle className='h-4 w-4 text-destructive' />}
            title={t(copy.failed)}
            mods={
              recap.failed
                ? [{ mod: recap.failed.mod, detail: recap.failed.message }]
                : []
            }
          />
          <RecapSection
            icon={<CircleSlash className='h-4 w-4 text-muted-foreground' />}
            title={t("myMods.bulkActionRecap.notAttempted")}
            mods={asItems(recap.notAttempted)}
          />
          <RecapSection
            icon={<CheckCircle className='h-4 w-4 text-green-500' />}
            title={t(copy.completed)}
            mods={asItems(recap.completed)}
          />
        </div>

        <DialogFooter>
          <Button onClick={onClose}>{t("myMods.bulkActionRecap.close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
