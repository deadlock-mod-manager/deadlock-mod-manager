import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { Input } from "@deadlock-mods/ui/components/input";
import { Label } from "@deadlock-mods/ui/components/label";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { cn } from "@deadlock-mods/ui/lib/utils";
import {
  FloppyDiskIcon,
  PackageIcon,
  WarningIcon,
  ArrowsClockwiseIcon,
} from "@phosphor-icons/react";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ModCategory } from "@/lib/constants";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import type { FoundryExportDestination } from "@/types/foundry";
import { ModStatus } from "@/types/mods";
import { useFoundry } from "./foundry-context";
import { FoundryLoadingBar } from "./foundry-loading-bar";

const DESTINATION_ICONS: Record<FoundryExportDestination, React.ReactNode> = {
  file: <FloppyDiskIcon className='h-5 w-5' weight='duotone' />,
  newMod: <PackageIcon className='h-5 w-5' weight='duotone' />,
  replaceSource: <ArrowsClockwiseIcon className='h-5 w-5' weight='duotone' />,
};

/** Turn a hero name into a filesystem-safe VPK filename. */
const suggestedFileName = (name: string): string => {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${slug || "foundry_skin"}_dir.vpk`;
};

const DestinationTile = ({
  destination,
  disabled,
  disabledReason,
  isSelected,
  onSelect,
}: {
  destination: FoundryExportDestination;
  disabled?: boolean;
  disabledReason?: string;
  isSelected: boolean;
  onSelect: () => void;
}) => {
  const { t } = useTranslation();
  return (
    <button
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
        isSelected
          ? "border-primary bg-primary/10"
          : "border-border/70 hover:border-primary/50 hover:bg-muted/60",
        disabled && "pointer-events-none opacity-50",
      )}
      disabled={disabled}
      onClick={onSelect}
      type='button'>
      <span className='mt-0.5 text-primary'>
        {DESTINATION_ICONS[destination]}
      </span>
      <span className='min-w-0 flex-1'>
        <span className='block font-medium text-sm'>
          {t(`foundry.export.destinations.${destination}.title`)}
        </span>
        <span className='block text-muted-foreground text-xs'>
          {disabled && disabledReason
            ? disabledReason
            : t(`foundry.export.destinations.${destination}.description`)}
        </span>
      </span>
    </button>
  );
};

interface FoundryExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Where the finished skin goes. Every destination packs the same VPK; they
 * differ only in where it lands, so the choice is presented once, here, rather
 * than as three separate buttons in the toolbar.
 */
export const FoundryExportDialog = ({
  open,
  onOpenChange,
}: FoundryExportDialogProps) => {
  const { t } = useTranslation();
  const { manifest, busy, exportVpk } = useFoundry();
  const addLocalMod = usePersistedStore((state) => state.addLocalMod);
  const heroName = manifest?.heroDisplay ?? manifest?.hero ?? "Foundry skin";
  const canReplace = Boolean(manifest?.sourcePath);

  const [destination, setDestination] =
    useState<FoundryExportDestination>("file");
  const [modName, setModName] = useState("");

  useEffect(() => {
    if (!open) return;
    setModName(t("foundry.export.defaultModName", { hero: heroName }));
    setDestination(canReplace ? "replaceSource" : "file");
  }, [open, heroName, canReplace, t]);

  const handleExport = useCallback(async () => {
    try {
      let outputPath: string | null = null;
      if (destination === "file") {
        outputPath = await saveDialog({
          title: t("foundry.export.title"),
          defaultPath: suggestedFileName(heroName),
          filters: [{ name: "VPK", extensions: ["vpk"] }],
        });
        if (!outputPath) return;
      }

      const result = await exportVpk({
        destination,
        outputPath,
        name: destination === "newMod" ? modName.trim() || heroName : heroName,
      });

      onOpenChange(false);
      if (result.destination === "newMod" && result.modId) {
        // The backend created the mod on disk; the library is renderer state, so
        // it has to be told about it here or the mod stays invisible until the
        // next scan.
        const now = new Date();
        addLocalMod(
          {
            id: result.modId,
            remoteId: result.modId,
            name: result.modName ?? heroName,
            description: t("foundry.export.modDescription"),
            remoteUrl: "local://foundry",
            author: "Mod Foundry",
            downloadable: false,
            remoteAddedAt: now,
            remoteUpdatedAt: now,
            tags: [],
            images: [],
            hero: manifest?.heroDisplay ?? manifest?.hero ?? null,
            isAudio: false,
            isMap: false,
            audioUrl: null,
            isNSFW: false,
            createdAt: now,
            updatedAt: now,
            downloadCount: 0,
            likes: 0,
            isBlacklisted: false,
            blacklistReason: null,
            blacklistedAt: null,
            blacklistedBy: null,
            isObsolete: false,
            category: ModCategory.SKINS,
            filesUpdatedAt: null,
            metadata: null,
            overrides: null,
            dependencies: null,
          },
          { status: ModStatus.Downloaded },
        );
      }
      if (result.destination === "newMod") {
        toast.success(
          t("foundry.export.addedToLibrary", {
            name: result.modName ?? heroName,
          }),
          {
            description: t("foundry.export.addedToLibraryHint"),
          },
        );
      } else if (result.destination === "replaceSource") {
        toast.success(t("foundry.export.replaced"), {
          description: t("foundry.export.replacedHint"),
        });
      } else {
        toast.success(t("foundry.export.success", { count: result.fileCount }));
      }
    } catch (err) {
      logger.withError(err).error("[Foundry] Export failed");
      toast.error(t("foundry.export.failed"));
    }
  }, [
    addLocalMod,
    destination,
    exportVpk,
    heroName,
    manifest,
    modName,
    onOpenChange,
    t,
  ]);

  return (
    <Dialog
      onOpenChange={(next) => {
        if (busy) return;
        onOpenChange(next);
      }}
      open={open}>
      <DialogContent className='max-w-lg'>
        <DialogHeader>
          <DialogTitle>{t("foundry.export.dialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("foundry.export.dialogDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-2'>
          <DestinationTile
            destination='file'
            disabled={busy}
            isSelected={destination === "file"}
            onSelect={() => setDestination("file")}
          />
          <DestinationTile
            destination='newMod'
            disabled={busy}
            isSelected={destination === "newMod"}
            onSelect={() => setDestination("newMod")}
          />
          <DestinationTile
            destination='replaceSource'
            disabled={!canReplace || busy}
            disabledReason={
              canReplace
                ? undefined
                : t("foundry.export.destinations.replaceSource.unavailable")
            }
            isSelected={destination === "replaceSource"}
            onSelect={() => setDestination("replaceSource")}
          />
        </div>

        {destination === "newMod" && (
          <div className='space-y-1.5'>
            <Label htmlFor='foundry-export-name'>
              {t("foundry.export.modNameLabel")}
            </Label>
            <Input
              id='foundry-export-name'
              onChange={(event) => setModName(event.target.value)}
              value={modName}
            />
          </div>
        )}

        {destination === "replaceSource" && (
          <div className='flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3'>
            <WarningIcon className='mt-0.5 h-4 w-4 shrink-0 text-amber-500' />
            <p className='text-xs'>{t("foundry.export.replaceWarning")}</p>
          </div>
        )}

        {busy && (
          <div className='space-y-2'>
            <p className='text-center text-muted-foreground text-xs'>
              {t("foundry.export.building")}
            </p>
            <FoundryLoadingBar />
          </div>
        )}

        <DialogFooter>
          <Button
            disabled={busy}
            onClick={() => onOpenChange(false)}
            variant='outline'>
            {t("common.cancel")}
          </Button>
          <Button disabled={busy} onClick={handleExport}>
            {busy ? t("foundry.export.building") : t("foundry.export.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
