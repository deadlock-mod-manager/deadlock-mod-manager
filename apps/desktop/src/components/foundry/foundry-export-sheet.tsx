import { Button } from "@deadlock-mods/ui/components/button";
import { Input } from "@deadlock-mods/ui/components/input";
import { ScrollArea } from "@deadlock-mods/ui/components/scroll-area";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { cn } from "@deadlock-mods/ui/lib/utils";
import {
  ArrowCounterClockwiseIcon,
  ArrowRightIcon,
  ArrowsClockwiseIcon,
  CheckIcon,
  FileIcon,
  FloppyDiskIcon,
  HammerIcon,
  ImageIcon,
  MusicNotesIcon,
  PaintBrushIcon,
  PlusCircleIcon,
  WarningIcon,
  XIcon,
} from "@phosphor-icons/react";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { ModCategory } from "@/lib/constants";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import type {
  FoundryExportDestination,
  FoundryExportResult,
} from "@/types/foundry";
import { ModStatus } from "@/types/mods";
import { FoundryHeroAssembling } from "./foundry-assembling";
import { partPaintKey, useFoundry } from "./foundry-context";
import { FoundryLoadingBar } from "./foundry-loading-bar";
import { loadSilhouette, type Silhouette } from "./foundry-silhouettes";

type ChangeGroup = "paint" | "cards" | "sounds" | "files";

const GROUP_ICONS = {
  paint: PaintBrushIcon,
  cards: ImageIcon,
  sounds: MusicNotesIcon,
  files: FileIcon,
} satisfies Record<ChangeGroup, React.ElementType>;

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

interface Change {
  path: string;
  group: ChangeGroup;
  label: string;
  detail: string;
  swatch?: string;
  thumb?: string;
}

/** Turn a hero name into a filesystem-safe VPK filename. */
const suggestedFileName = (name: string): string => {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${slug || "foundry_skin"}_dir.vpk`;
};

/** Every edit in the workspace, named the way its tab names it. */
const useChanges = (): Change[] => {
  const { t } = useTranslation();
  const { manifest, editedPaths, paintParts, appliedPaint, cardPreviews } =
    useFoundry();
  return useMemo(() => {
    if (!manifest) return [];
    const parts = new Map(
      paintParts.map((part) => [part.texture.toLowerCase(), part]),
    );
    const cards = new Map(
      [...cardPreviews.defaultCards, ...cardPreviews.modCards].map((card) => [
        card.path,
        card,
      ]),
    );
    const sounds = new Set(manifest.sounds.map((entry) => entry.path));
    const filename = (path: string) =>
      path
        .split("/")
        .pop()
        ?.replace(/\.[^.]+$/, "") ?? path;

    return [...editedPaths].map((path): Change => {
      const part = parts.get(path.toLowerCase());
      const card = cards.get(path);
      if (part) {
        const paint = appliedPaint[partPaintKey(part.texture)];
        return {
          path,
          group: "paint",
          label: part.label,
          detail: t("foundry.exportSheet.repainted"),
          swatch: paint?.colorHex,
        };
      }
      if (card) {
        return {
          path,
          group: "cards",
          label: t(`foundry.cards.variants.${card.variant}`, {
            defaultValue: card.variant.replaceAll("_", " "),
          }),
          detail: t("foundry.exportSheet.replaced"),
          thumb: card.dataUrl,
        };
      }
      if (sounds.has(path)) {
        return {
          path,
          group: "sounds",
          label: filename(path),
          detail: t("foundry.exportSheet.replaced"),
        };
      }
      return {
        path,
        group: path.endsWith(".vtex_c") ? "paint" : "files",
        label: filename(path),
        detail: t("foundry.exportSheet.edited"),
      };
    });
  }, [manifest, editedPaths, paintParts, appliedPaint, cardPreviews, t]);
};

const ChangeRow = ({ change }: { change: Change }) => {
  const { t } = useTranslation();
  const { revertEntry, busy } = useFoundry();
  const Icon = GROUP_ICONS[change.group];
  return (
    <li className='flex items-center gap-2.5 rounded-md bg-background px-2 py-1.5'>
      {change.swatch ? (
        <span
          className='h-[22px] w-[22px] shrink-0 rounded-[5px] border border-white/15'
          style={{ backgroundColor: change.swatch }}
        />
      ) : change.thumb ? (
        <img
          alt=''
          className='h-[30px] w-[22px] shrink-0 rounded-[3px] object-cover'
          src={change.thumb}
        />
      ) : (
        <span className='flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[5px] bg-muted'>
          <Icon className='h-3 w-3' />
        </span>
      )}
      <span className='flex min-w-0 flex-1 flex-col'>
        <span className='truncate font-medium text-xs'>{change.label}</span>
        <span className='truncate text-[10px] text-muted-foreground'>
          {change.detail}
        </span>
      </span>
      <button
        aria-label={t("foundry.exportSheet.undo", { name: change.label })}
        className='flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] text-muted-foreground hover:bg-muted hover:text-foreground'
        disabled={busy}
        onClick={() =>
          revertEntry(change.path).catch((err) => {
            logger.withError(err).error("[Foundry] Revert failed");
            toast.error(t("foundry.editor.revertFailed"));
          })
        }
        title={t("foundry.exportSheet.undo", { name: change.label })}
        type='button'>
        <ArrowCounterClockwiseIcon className='h-[13px] w-[13px]' />
      </button>
    </li>
  );
};

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <h3 className='font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.08em]'>
    {children}
  </h3>
);

/** The finished hero, drawn in still embers, with the result under it. */
const ExportedView = ({
  result,
  changes,
  onClose,
}: {
  result: FoundryExportResult;
  changes: Change[];
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { manifest } = useFoundry();
  const hero = manifest?.heroDisplay ?? manifest?.hero ?? "";
  const [silhouette, setSilhouette] = useState<Silhouette | null>(null);
  useEffect(() => {
    if (hero) void loadSilhouette(hero).then(setSilhouette);
  }, [hero]);
  const counts = (["paint", "cards", "sounds", "files"] as const)
    .map((group) => ({
      group,
      count: changes.filter((change) => change.group === group).length,
    }))
    .filter(({ count }) => count > 0);
  const name = result.modName ?? hero;

  return (
    <div className='flex flex-1 flex-col items-center justify-center px-7 pb-6'>
      <div className='relative h-[300px] w-[260px]'>
        <div className='absolute inset-x-0 bottom-8 mx-auto h-24 w-56 rounded-[50%] bg-[radial-gradient(closest-side,rgb(242_138_75/0.3),transparent)]' />
        <FoundryHeroAssembling
          className='absolute inset-0'
          silhouette={silhouette}
        />
        <span className='absolute bottom-0 left-1/2 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full border-[5px] border-card bg-primary text-primary-foreground shadow-[0_0_24px_hsl(var(--primary)/0.45)]'>
          <CheckIcon className='h-6 w-6' weight='bold' />
        </span>
      </div>
      <div className='space-y-1.5 py-5 text-center'>
        <h2 className='font-semibold text-lg'>
          {result.destination === "newMod"
            ? t("foundry.exportSheet.doneNewMod", { name })
            : result.destination === "replaceSource"
              ? t("foundry.export.replaced")
              : t("foundry.exportSheet.doneFile")}
        </h2>
        <p className='text-muted-foreground text-xs leading-[1.5]'>
          {result.destination === "newMod"
            ? t("foundry.exportSheet.doneNewModHint")
            : result.destination === "replaceSource"
              ? t("foundry.export.replacedHint")
              : t("foundry.export.success", { count: result.fileCount })}
        </p>
      </div>
      {counts.length > 0 && (
        <div className='flex flex-wrap justify-center gap-2 pb-5'>
          {counts.map(({ group, count }) => {
            const Icon = GROUP_ICONS[group];
            return (
              <span
                className='flex items-center gap-[5px] rounded-[5px] border bg-background px-2 py-1 font-medium text-[11px]'
                key={group}>
                <Icon className='h-3 w-3 text-secondary-foreground' />
                {t(`foundry.exportSheet.facts.${group}`, { count })}
              </span>
            );
          })}
        </div>
      )}
      <div className='w-full space-y-2'>
        {result.destination === "newMod" && (
          <Button
            className='h-10 w-full font-semibold'
            icon={<ArrowRightIcon className='h-4 w-4' />}
            onClick={() => navigate("/my-mods")}>
            {t("foundry.exportSheet.openMyMods")}
          </Button>
        )}
        <Button className='h-9 w-full' onClick={onClose} variant='outline'>
          {t("foundry.exportSheet.keepEditing")}
        </Button>
      </div>
    </div>
  );
};

/**
 * Review what changed, pick where it goes, build the VPK. A sheet over the
 * workspace rather than a dialog, so the work stays in view behind it.
 */
export const FoundryExportSheet = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const { manifest, busy, exportVpk } = useFoundry();
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
          <ExportedView changes={changes} onClose={onClose} result={result} />
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
