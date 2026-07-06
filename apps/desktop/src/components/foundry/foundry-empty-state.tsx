import { Button } from "@deadlock-mods/ui/components/button";
import { HammerIcon, UploadSimpleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useFoundry } from "./foundry-context";
import { FoundryImportDialog } from "./foundry-import-dialog";

/**
 * Landing surface shown before a skin is loaded. Opens the import dialog, where
 * the user picks one of their hero skins or a local VPK.
 */
export const FoundryEmptyState = () => {
  const { t } = useTranslation();
  const { status } = useFoundry();
  const [importOpen, setImportOpen] = useState(false);

  return (
    <div className='flex h-full w-full flex-col items-center justify-center gap-6 p-8 text-center'>
      <div className='flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10'>
        <HammerIcon className='h-10 w-10 text-primary' weight='duotone' />
      </div>
      <div className='max-w-md space-y-2'>
        <h2 className='font-semibold text-2xl'>{t("foundry.empty.title")}</h2>
        <p className='text-muted-foreground text-sm'>
          {t("foundry.empty.description")}
        </p>
      </div>
      <Button
        disabled={status === "analyzing"}
        icon={<UploadSimpleIcon className='h-4 w-4' />}
        onClick={() => setImportOpen(true)}
        size='lg'>
        {status === "analyzing"
          ? t("foundry.import.analyzing")
          : t("foundry.import.cta")}
      </Button>
      <FoundryImportDialog onOpenChange={setImportOpen} open={importOpen} />
    </div>
  );
};
