import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { format, fromUnixTime } from "date-fns";
import { Markup } from "interweave";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { createMarkupLinkTransform } from "@/lib/markup-transform";
import type { PatchNote } from "@/lib/steam-news";

export const PatchNotesDialog = ({
  note,
  onClose,
}: {
  note: PatchNote | null;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const markupTransform = useMemo(
    () => createMarkupLinkTransform(navigate),
    [navigate],
  );

  return (
    <Dialog
      open={note !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}>
      <DialogContent className='max-h-[85vh] max-w-2xl overflow-y-auto'>
        {note && (
          <>
            <DialogHeader>
              <div className='flex items-center gap-2'>
                <Badge variant={note.isPatch ? "default" : "secondary"}>
                  {t(
                    note.isPatch
                      ? "patchNotes.kindPatch"
                      : "patchNotes.kindAnnouncement",
                  )}
                </Badge>
                <DialogDescription>
                  {format(fromUnixTime(note.publishedAt), "PPP")}
                </DialogDescription>
              </div>
              <DialogTitle className='text-xl leading-tight'>
                {note.title}
              </DialogTitle>
            </DialogHeader>
            <div className='prose prose-sm dark:prose-invert max-w-none text-sm prose-img:rounded-md prose-p:my-1.5 prose-ul:my-2 prose-li:my-0.5'>
              <Markup content={note.html} transform={markupTransform} />
            </div>
            <DialogFooter>
              <Button onClick={() => openUrl(note.url)} variant='outline'>
                <ArrowSquareOutIcon className='size-4' />
                {t("patchNotes.openOnSteam")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
