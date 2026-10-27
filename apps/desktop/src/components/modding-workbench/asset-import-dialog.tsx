import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@deadlock-mods/ui/components/dialog";
import { useIsMutating } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { ModdingAddon } from "@/types/generated/ModdingAddon";
import { ArchiveBrowser } from "./archive-browser";

interface Props {
  addon: ModdingAddon;
  onClose: () => void;
  onImported: () => void;
}

export const AssetImportDialog = ({ addon, onClose, onImported }: Props) => {
  const { t } = useTranslation();
  const busy =
    useIsMutating({ mutationKey: ["workbench-import", addon.id] }) > 0;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}>
      <DialogContent className='flex h-[min(780px,88vh)] w-[94vw] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-[1600px]'>
        <DialogHeader className='gap-1 border-b px-5 py-4'>
          <DialogTitle>{t("workbenchExplorer.addFiles")}</DialogTitle>
          <DialogDescription>
            {t("workbenchExplorer.importDescription", { addon: addon.name })}
          </DialogDescription>
          <p
            className='truncate pt-1 font-mono text-[11px] text-muted-foreground'
            title={addon.archivePath}>
            {addon.archivePath}
          </p>
        </DialogHeader>
        <ArchiveBrowser mode={{ kind: "import", addon, onImported }} />
      </DialogContent>
    </Dialog>
  );
};
