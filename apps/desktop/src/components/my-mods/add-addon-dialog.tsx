import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { Label } from "@deadlock-mods/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { AlertTriangle } from "@deadlock-mods/ui/icons";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ModMetadataForm, {
  type ModMetadata,
  type ModMetadataFormHandle,
} from "@/components/mod-creation/mod-metadata-form";
import { useModProcessor } from "@/hooks/use-mod-processor";
import { getErrorMessage } from "@/lib/errors";
import {
  getModCategoryDisplayName,
  MOD_CATEGORY_ORDER,
  ModCategory,
} from "@/lib/constants";
import type { LocalAddonInfo } from "@/types/mods";

interface AddAddonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  addon: LocalAddonInfo | null;
}

export const AddAddonDialog = ({
  open,
  onOpenChange,
  addon,
}: AddAddonDialogProps) => {
  const { t } = useTranslation();
  const { processLocalAddon } = useModProcessor();
  const [isProcessing, setIsProcessing] = useState(false);
  const [category, setCategory] = useState(ModCategory.SKINS);
  const [initialMeta, setInitialMeta] = useState<
    Partial<ModMetadata> | undefined
  >(undefined);
  const metaRef = useRef<ModMetadataFormHandle>(null);
  // A second click lands before isProcessing re-renders the button disabled.
  const submitting = useRef(false);

  // Reset form when addon changes
  useEffect(() => {
    if (addon) {
      const baseName = addon.fileName.replace(/\.(vpk|zip|rar|7z)$/i, "");
      setInitialMeta({
        name: baseName,
        author: "",
        description: `Local mod: ${addon.fileName}`,
      });
      setCategory(ModCategory.SKINS);
    }
  }, [addon]);

  const handleAdd = async () => {
    if (!addon) {
      toast.error(t("addons.noAddonSelected"));
      return;
    }
    if (submitting.current) return;
    submitting.current = true;

    try {
      const metadata = await metaRef.current?.validateAndGet();
      if (!metadata) {
        return;
      }

      setIsProcessing(true);
      // Use a custom processMod for already-installed local addons
      await processLocalAddon(metadata, category, addon);
      toast.success(t("addons.addToLibrarySuccess", { name: metadata.name }));
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to add mod:", error);
      toast.error(t("addons.failedToAddModToLibrary"), {
        description: getErrorMessage(error),
      });
    } finally {
      submitting.current = false;
      setIsProcessing(false);
    }
  };

  if (!addon) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{t("addons.addToLibraryTitle")}</DialogTitle>
          <DialogDescription>
            {t("addons.addToLibraryDescription", { fileName: addon.fileName })}
          </DialogDescription>
        </DialogHeader>

        <ModMetadataForm hideCardChrome initial={initialMeta} ref={metaRef} />

        <div className='space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='category'>{t("addMods.category")}</Label>
            <Select
              value={category}
              onValueChange={(value) => setCategory(value as ModCategory)}>
              <SelectTrigger>
                <SelectValue placeholder={t("addMods.selectCategory")} />
              </SelectTrigger>
              <SelectContent>
                {MOD_CATEGORY_ORDER.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {getModCategoryDisplayName(cat)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3'>
            <div className='flex items-start gap-2'>
              <AlertTriangle className='w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5' />
              <div className='text-xs text-amber-800 dark:text-amber-200'>
                <p className='font-medium mb-1'>Custom Mod Warning</p>
                <p>
                  This mod is already installed in your game directory. If you
                  disable it later, you won't be able to re-install it
                  automatically since it's not from our database. You would need
                  to manually re-add it.
                </p>
              </div>
            </div>
          </div>

          <div className='rounded-md bg-muted p-3 text-xs'>
            <span className='font-medium'>Source:</span> {addon.fileName}
          </div>
        </div>

        <div className='flex justify-end gap-2 mt-6'>
          <Button
            variant='ghost'
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleAdd} disabled={isProcessing}>
            {isProcessing ? t("addons.adding") : t("addons.addToLibraryTitle")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
