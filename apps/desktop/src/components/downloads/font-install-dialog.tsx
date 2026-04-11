import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { useTranslation } from "react-i18next";
import type { FontInfo } from "@/types/mods";

interface FontInstallDialogProps {
  readonly isOpen: boolean;
  readonly fonts: FontInfo[];
  readonly onInstall: () => void;
  readonly onSkip: () => void;
}

export function FontInstallDialog({
  isOpen,
  fonts,
  onInstall,
  onSkip,
}: FontInstallDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onSkip()}>
      <DialogContent className='max-w-md' onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{t("fontInstall.title")}</DialogTitle>
          <DialogDescription>{t("fontInstall.description")}</DialogDescription>
        </DialogHeader>

        <ul className='my-2 space-y-1 rounded-md border bg-muted/50 p-3 text-sm'>
          {fonts.map((font) => (
            <li key={font.fileName} className='flex flex-col'>
              <span className='font-medium'>{font.fontName}</span>
              <span className='text-xs text-muted-foreground'>
                {font.fileName}
              </span>
            </li>
          ))}
        </ul>

        <DialogFooter className='gap-2'>
          <Button variant='outline' onClick={onSkip}>
            {t("fontInstall.skip")}
          </Button>
          <Button onClick={onInstall}>{t("fontInstall.install")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
