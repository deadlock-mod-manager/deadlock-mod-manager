import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { ScrollArea } from "@deadlock-mods/ui/components/scroll-area";
import { SearchInput } from "@deadlock-mods/ui/components/search-input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@deadlock-mods/ui/components/tabs";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { ImageIcon, UploadSimpleIcon } from "@phosphor-icons/react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePersistedStore } from "@/lib/store";
import { type LocalMod, ModStatus } from "@/types/mods";
import { useFoundry } from "./foundry-context";

/** A hero skin has a resolved hero and is neither a map nor an audio mod. */
const isHeroSkin = (mod: LocalMod): boolean =>
  !mod.isMap && !mod.isAudio && Boolean(mod.heroOverride ?? mod.detectedHero);

const SkinTile = ({
  mod,
  disabled,
  onSelect,
}: {
  mod: LocalMod;
  disabled: boolean;
  onSelect: () => void;
}) => {
  const { t } = useTranslation();
  return (
    <button
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-lg border text-left transition-colors hover:border-primary",
        disabled && "pointer-events-none opacity-60",
      )}
      disabled={disabled}
      onClick={onSelect}
      type='button'>
      <div className='relative'>
        {mod.images && mod.images.length > 0 ? (
          <img
            alt={mod.name}
            className='h-28 w-full object-cover'
            decoding='async'
            loading='lazy'
            src={mod.images[0]}
          />
        ) : (
          <div className='flex h-28 w-full items-center justify-center bg-muted'>
            <ImageIcon
              className='h-8 w-8 text-muted-foreground'
              weight='duotone'
            />
          </div>
        )}
        {mod.status === ModStatus.Installed && (
          <Badge className='absolute top-2 right-2'>
            {t("modStatus.installed")}
          </Badge>
        )}
      </div>
      <div className='flex min-w-0 flex-col gap-0.5 p-2'>
        <span className='truncate font-medium text-sm' title={mod.name}>
          {mod.name}
        </span>
        <span
          className='truncate text-muted-foreground text-xs'
          title={mod.author}>
          {t("mods.by")} {mod.author}
        </span>
      </div>
    </button>
  );
};

interface FoundryImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Import surface for the Foundry: pick from the user's installed hero skins
 * (library grid with preview images, hero skins only) or import a local VPK.
 */
export const FoundryImportDialog = ({
  open,
  onOpenChange,
}: FoundryImportDialogProps) => {
  const { t } = useTranslation();
  const { importMod, importVpk, status } = useFoundry();
  const localMods = usePersistedStore((state) => state.localMods);
  const [query, setQuery] = useState("");
  const busy = status === "analyzing";

  const heroSkins = useMemo(() => {
    const q = query.trim().toLowerCase();
    return localMods
      .filter(isHeroSkin)
      .filter((mod) => !q || mod.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [localMods, query]);

  const handleSelectMod = useCallback(
    async (mod: LocalMod) => {
      const result = await importMod(mod.remoteId);
      if (result) onOpenChange(false);
    },
    [importMod, onOpenChange],
  );

  const handleBrowseFile = useCallback(async () => {
    const selected = await openDialog({
      multiple: false,
      directory: false,
      title: t("foundry.import.browseTitle"),
      filters: [{ name: "VPK", extensions: ["vpk"] }],
    });
    if (selected && typeof selected === "string") {
      const result = await importVpk(selected);
      if (result) onOpenChange(false);
    }
  }, [importVpk, onOpenChange, t]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className='flex h-[80vh] max-w-3xl flex-col gap-0 overflow-hidden p-0'>
        <DialogHeader className='shrink-0 space-y-1.5 border-b p-6 pb-4'>
          <DialogTitle>{t("foundry.import.dialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("foundry.import.dialogDescription")}
          </DialogDescription>
        </DialogHeader>

        <Tabs
          className='flex min-h-0 flex-1 flex-col overflow-hidden'
          defaultValue='library'>
          <div className='shrink-0 px-6 pt-4'>
            <TabsList className='grid w-full grid-cols-2'>
              <TabsTrigger value='library'>
                {t("foundry.import.fromLibrary")}
              </TabsTrigger>
              <TabsTrigger value='file'>
                {t("foundry.import.fromFile")}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent
            className='mt-0 min-h-0 grow basis-0 gap-3 px-6 pt-4 pb-6 data-[state=active]:flex data-[state=inactive]:hidden data-[state=active]:flex-col'
            value='library'>
            <div className='shrink-0'>
              <SearchInput
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("foundry.import.searchPlaceholder")}
                value={query}
              />
            </div>
            {heroSkins.length === 0 ? (
              <div className='flex flex-1 items-center justify-center'>
                <p className='max-w-sm text-center text-muted-foreground text-sm'>
                  {t("foundry.import.noHeroSkins")}
                </p>
              </div>
            ) : (
              <ScrollArea className='min-h-0 flex-1 pr-3'>
                <div className='grid grid-cols-2 gap-3 pb-1 sm:grid-cols-3'>
                  {heroSkins.map((mod) => (
                    <SkinTile
                      disabled={busy}
                      key={mod.remoteId ?? mod.id}
                      mod={mod}
                      onSelect={() => handleSelectMod(mod)}
                    />
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent
            className='mt-0 min-h-0 grow basis-0 px-6 pt-4 pb-6 data-[state=active]:flex data-[state=inactive]:hidden data-[state=active]:flex-col'
            value='file'>
            <div className='flex min-h-0 flex-1 flex-col items-center justify-center gap-4'>
              <div className='flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10'>
                <UploadSimpleIcon
                  className='h-8 w-8 text-primary'
                  weight='duotone'
                />
              </div>
              <p className='max-w-sm text-center text-muted-foreground text-sm'>
                {t("foundry.import.fileHint")}
              </p>
              <Button
                disabled={busy}
                icon={<UploadSimpleIcon className='h-4 w-4' />}
                onClick={handleBrowseFile}>
                {busy
                  ? t("foundry.import.analyzing")
                  : t("foundry.import.browseCta")}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
