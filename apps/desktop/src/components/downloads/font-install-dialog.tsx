import { Button, buttonVariants } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { ScrollArea } from "@deadlock-mods/ui/components/scroll-area";
import {
  DownloadSimpleIcon,
  FileTextIcon,
  TextAaIcon,
} from "@phosphor-icons/react";
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
  const fontCount = fonts.length;

  return (
    <Dialog open={isOpen}>
      <DialogContent
        className='sm:max-w-md'
        onClick={(e) => e.stopPropagation()}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}>
        <DialogHeader>
          <div className='mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10'>
            <TextAaIcon className='h-5 w-5 text-primary' weight='bold' />
          </div>
          <DialogTitle>{t("fontInstall.title")}</DialogTitle>
          <DialogDescription>{t("fontInstall.description")}</DialogDescription>
        </DialogHeader>

        <div className='rounded-md border bg-muted/40'>
          <div className='flex items-center justify-between border-b px-3 py-2'>
            <span className='font-medium text-muted-foreground text-xs uppercase tracking-wide'>
              {t("fontInstall.fontsLabel", { count: fontCount })}
            </span>
            <span className='font-mono text-muted-foreground text-xs'>
              {fontCount}
            </span>
          </div>
          <ScrollArea className='max-h-48'>
            <ul className='divide-y divide-border/60'>
              {fonts.map((font) => (
                <li
                  key={font.fileName}
                  className='flex items-center gap-3 px-3 py-2'>
                  <FileTextIcon
                    className='h-4 w-4 shrink-0 text-muted-foreground'
                    weight='duotone'
                  />
                  <div className='flex min-w-0 flex-col'>
                    <span className='truncate font-medium text-sm'>
                      {font.fontName}
                    </span>
                    <span className='truncate font-mono text-muted-foreground text-xs'>
                      {font.fileName}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </div>

        <DialogFooter className='gap-2 sm:gap-2'>
          <button
            className={buttonVariants({ variant: "outline" })}
            onClick={onSkip}
            type='button'>
            {t("fontInstall.skip")}
          </button>
          <Button onClick={onInstall} type='button'>
            <DownloadSimpleIcon className='mr-2 h-4 w-4' weight='bold' />
            {t("fontInstall.install")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
