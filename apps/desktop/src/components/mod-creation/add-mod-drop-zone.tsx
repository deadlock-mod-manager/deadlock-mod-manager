import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { UploadSimple } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { useFileDrop } from "@/hooks/use-file-drop";
import type { DetectedSource } from "@/lib/file-utils";
import { cn } from "@/lib/utils";

interface AddModDropZoneProps {
  onSource: (source: DetectedSource) => void;
}

export const AddModDropZone = ({ onSource }: AddModDropZoneProps) => {
  const { t } = useTranslation();
  const { isDragging, dragHandlers, openTauriFilePicker } = useFileDrop(
    onSource,
    (message) => toast.error(message),
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("addMods.title")}</DialogTitle>
        <DialogDescription>{t("addMods.cardDescription")}</DialogDescription>
      </DialogHeader>
      <div
        aria-label={t("addMods.dropAreaText")}
        className={cn(
          "flex h-48 w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-md border border-dashed text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isDragging
            ? "border-primary bg-primary/5"
            : "hover:border-foreground/30 hover:bg-muted/40",
        )}
        onClick={openTauriFilePicker}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          openTauriFilePicker();
        }}
        role='button'
        tabIndex={0}
        {...dragHandlers}>
        <span className='flex size-11 items-center justify-center rounded-full bg-muted'>
          <UploadSimple
            className={cn(
              "size-5",
              isDragging ? "text-primary" : "text-muted-foreground",
            )}
          />
        </span>
        <span className='space-y-1'>
          <span className='block font-medium text-sm'>
            {t("addMods.dropAreaText")}
          </span>
          <span className='block text-muted-foreground text-xs'>
            {t("addMods.supportedFormats")}
          </span>
        </span>
      </div>
    </>
  );
};
