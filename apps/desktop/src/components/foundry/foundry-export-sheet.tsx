import { Button } from "@deadlock-mods/ui/components/button";
import { Input } from "@deadlock-mods/ui/components/input";
import { ScrollArea } from "@deadlock-mods/ui/components/scroll-area";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { cn } from "@deadlock-mods/ui/lib/utils";
import {
  ArrowsClockwiseIcon,
  FloppyDiskIcon,
  HammerIcon,
  PlusCircleIcon,
  WarningIcon,
  XIcon,
} from "@phosphor-icons/react";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ModCategory } from "@/lib/constants";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import type {
  FoundryExportDestination,
  FoundryExportResult,
} from "@/types/foundry";
import { ModStatus } from "@/types/mods";
import { useFoundry } from "./foundry-context";
import { FoundryLoadingBar } from "./foundry-loading-bar";
import { useChanges } from "./use-foundry-export-changes";
import { ExportedView } from "./foundry-exported-view";
import { SectionLabel } from "./foundry-export-section-label";
import { GROUP_ICONS, ChangeRow } from "./foundry-export-change-row";

const DESTINATION_ICONS = {
  newMod: PlusCircleIcon,
  file: FloppyDiskIcon,
  replaceSource: ArrowsClockwiseIcon,
} satisfies Record<FoundryExportDestination, React.ElementType>;

const DESTINATIONS: FoundryExportDestination[] = [
  "newMod",
  "file",
  "replaceSource",
];

/** Turn a hero name into a filesystem-safe VPK filename. */
const suggestedFileName = (name: string): string => {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${slug || "foundry_skin"}_dir.vpk`;
};

/**
 * Review what changed, pick where it goes, build the VPK. A sheet over the
 * workspace rather than a dialog, so the work stays in view behind it.
 */
export const FoundryExportSheet = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const { manifest, busy, exportVpk, captureHero } = useFoundry();
  const addLocalMod = usePersistedStore((state) => state.addLocalMod);
  const changes = useChanges();
  const heroName = manifest?.heroDisplay ?? manifest?.hero ?? "Foundry skin";
  const canReplace = Boolean(manifest?.sourcePath);
  const [destination, setDestination] =
    useState<FoundryExportDestination>("newMod");
  const [modName, setModName] = useState(() =>
    t("foundry.export.defaultModName", { hero: heroName }),
  );
  const [result, setResult] = useState<FoundryExportResult | null>(null);
  // Capture the finished skin while the viewer is still mounted behind the sheet.
  const [heroStill, setHeroStill] = useState<string | null>(null);
  useEffect(() => {
    if (!result) return;
    let still: string | null = null;
    let cancelled = false;
    void captureHero().then((url) => {
      if (cancelled) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      still = url;
      setHeroStill(url);
    });
    return () => {
      cancelled = true;
      if (still) URL.revokeObjectURL(still);
    };
  }, [captureHero, result]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const build = useCallback(async () => {
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
      const exported = await exportVpk({
        destination,
        outputPath,
        name: destination === "newMod" ? modName.trim() || heroName : heroName,
      });
      if (exported.destination === "newMod" && exported.modId) {
        // The backend created the mod on disk; the library is renderer state,
        // so it has to be told here or the mod stays invisible until a scan.
        const now = new Date();
        addLocalMod(
          {
            id: exported.modId,
            remoteId: exported.modId,
            name: exported.modName ?? heroName,
            description: t("foundry.export.modDescription"),
            remoteUrl: "local://foundry",
            author: "Mod Foundry",
            modAuthorId: null,
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
      setResult(exported);
    } catch (err) {
      logger.withError(err).error("[Foundry] Export failed");
      toast.error(t("foundry.export.failed"));
    }
  }, [addLocalMod, destination, exportVpk, heroName, manifest, modName, t]);

  const groups = (["paint", "cards", "sounds", "files"] as const)
    .map((group) => ({
      group,
      changes: changes.filter((change) => change.group === group),
    }))
    .filter((entry) => entry.changes.length > 0);

  return (
    <div className='absolute inset-0 z-20 flex justify-end'>
      <button
        aria-label={t("common.close")}
        className='absolute inset-0 bg-background/70 backdrop-blur-[1px]'
        disabled={busy}
        onClick={onClose}
        type='button'
      />
      <aside className='relative flex h-full w-[420px] flex-col border-l bg-card shadow-[-12px_0_40px_rgb(0_0_0/0.5)] duration-200 animate-in slide-in-from-right-8'>
        <div className='flex shrink-0 items-center gap-2.5 px-[18px] py-4'>
          {!result && (
            <div className='min-w-0 flex-1'>
              <h2 className='font-semibold text-base'>
                {t("foundry.exportSheet.title", { hero: heroName })}
              </h2>
              <p className='text-muted-foreground text-xs'>
                {changes.length > 0
                  ? t("foundry.exportSheet.changeCount", {
                      count: changes.length,
                    })
                  : t("foundry.exportSheet.noChanges")}
              </p>
            </div>
          )}
          <button
            aria-label={t("common.close")}
            className='ml-auto flex h-[30px] w-[30px] items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground'
            disabled={busy}
            onClick={onClose}
            type='button'>
            <XIcon className='h-4 w-4' />
          </button>
        </div>

        {result ? (
          <ExportedView
            changes={changes}
            heroStill={heroStill}
            onClose={onClose}
            result={result}
          />
        ) : (
          <>
            <ScrollArea className='min-h-0 flex-1 border-t'>
              {groups.length > 0 && (
                <section className='space-y-3 border-b px-[18px] py-3.5'>
                  <SectionLabel>
                    {t("foundry.exportSheet.changed")}
                  </SectionLabel>
                  {groups.map(({ group, changes: items }) => {
                    const Icon = GROUP_ICONS[group];
                    return (
                      <div className='space-y-1' key={group}>
                        <p className='flex items-center gap-[7px] font-semibold text-xs'>
                          <Icon className='h-3.5 w-3.5 text-secondary-foreground' />
                          {t(`foundry.exportSheet.groups.${group}`)}
                        </p>
                        <ul className='space-y-1'>
                          {items.map((change) => (
                            <ChangeRow change={change} key={change.path} />
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </section>
              )}
              <section className='space-y-2.5 px-[18px] py-3.5'>
                <SectionLabel>{t("foundry.exportSheet.where")}</SectionLabel>
                {DESTINATIONS.map((option) => {
                  const Icon = DESTINATION_ICONS[option];
                  const selected = destination === option;
                  const unavailable = option === "replaceSource" && !canReplace;
                  return (
                    <div
                      className={cn(
                        "rounded-lg border p-3 transition-colors",
                        selected
                          ? "border-primary bg-primary/5"
                          : "hover:border-muted-foreground/40",
                        unavailable && "opacity-50",
                      )}
                      key={option}>
                      <button
                        aria-pressed={selected}
                        className='flex w-full gap-3 text-left'
                        disabled={unavailable || busy}
                        onClick={() => setDestination(option)}
                        type='button'>
                        <span
                          className={cn(
                            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-[1.5px]",
                            selected
                              ? "border-primary"
                              : "border-muted-foreground/50",
                          )}>
                          {selected && (
                            <span className='h-2 w-2 rounded-full bg-primary' />
                          )}
                        </span>
                        <span className='min-w-0 flex-1 space-y-[3px]'>
                          <span className='flex items-center gap-1.5 font-semibold text-[13px]'>
                            <Icon
                              className={cn(
                                "h-3.5 w-3.5",
                                selected
                                  ? "text-primary"
                                  : "text-muted-foreground",
                              )}
                            />
                            {t(`foundry.export.destinations.${option}.title`)}
                          </span>
                          <span className='block text-[11px] text-muted-foreground leading-[1.4]'>
                            {unavailable
                              ? t(
                                  "foundry.export.destinations.replaceSource.unavailable",
                                )
                              : t(
                                  `foundry.export.destinations.${option}.description`,
                                )}
                          </span>
                        </span>
                      </button>
                      {selected && option === "newMod" && (
                        <Input
                          aria-label={t("foundry.export.modNameLabel")}
                          className='mt-2.5 ml-7 h-8 w-[calc(100%-1.75rem)] text-[13px]'
                          onChange={(event) => setModName(event.target.value)}
                          value={modName}
                        />
                      )}
                      {selected && option === "replaceSource" && (
                        <p className='mt-2.5 ml-7 flex items-start gap-1.5 text-[11px] text-amber-500'>
                          <WarningIcon className='mt-px h-3.5 w-3.5 shrink-0' />
                          {t("foundry.export.replaceWarning")}
                        </p>
                      )}
                    </div>
                  );
                })}
              </section>
            </ScrollArea>
            <div className='shrink-0 space-y-2.5 border-t px-[18px] pt-3 pb-4'>
              {busy && <FoundryLoadingBar />}
              <Button
                className='h-10 w-full font-semibold'
                disabled={busy}
                icon={<HammerIcon className='h-4 w-4' />}
                isLoading={busy}
                onClick={build}>
                {busy
                  ? t("foundry.export.building")
                  : t(`foundry.exportSheet.build.${destination}`)}
              </Button>
              {destination !== "replaceSource" && (
                <p className='text-center text-[11px] text-muted-foreground'>
                  {t("foundry.exportSheet.untouched")}
                </p>
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  );
};
