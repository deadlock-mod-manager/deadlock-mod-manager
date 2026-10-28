import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import { cn } from "@deadlock-mods/ui/lib/utils";
import {
  CubeIcon,
  ExportIcon,
  ImageIcon,
  MusicNotesIcon,
  PaintBrushIcon,
  RepeatIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_FOUNDRY_SKINS } from "@/lib/foundry-default-skins";
import type { FoundryTab } from "@/types/foundry";
import { FoundryAssetsRail } from "./foundry-assets-rail";
import { FoundryCardsWorkspace } from "./foundry-cards-workspace";
import { useFoundry } from "./foundry-context";
import { FoundryExportSheet } from "./foundry-export-sheet";
import { FoundryImportDialog } from "./foundry-import-dialog";
import { FoundryInspector } from "./foundry-inspector";
import { FoundryPaintWorkspace } from "./foundry-paint-workspace";
import { FoundryPreview } from "./foundry-preview";
import { FoundrySoundsWorkspace } from "./foundry-sounds-workspace";

const TABS: FoundryTab[] = ["assets", "paint", "cards", "sounds"];

const TAB_ICONS = {
  assets: CubeIcon,
  paint: PaintBrushIcon,
  cards: ImageIcon,
  sounds: MusicNotesIcon,
} satisfies Record<FoundryTab, React.ElementType>;

const SIDE_PANEL_CLASS =
  "flex h-full shrink-0 flex-col overflow-hidden bg-card";

/** The skin's identity: portrait, hero, counts and where it came from. */
const SkinIdentity = () => {
  const { t } = useTranslation();
  const { manifest, skinOrigin, editedPaths } = useFoundry();
  if (!manifest) return null;

  const hero = manifest.heroDisplay ?? manifest.hero;
  const portrait =
    skinOrigin?.imageUrl ??
    DEFAULT_FOUNDRY_SKINS.find((skin) => skin.hero === hero)?.image ??
    null;
  const source =
    skinOrigin?.kind === "mod"
      ? skinOrigin.author
        ? t("foundry.header.fromMod", {
            name: skinOrigin.name,
            author: skinOrigin.author,
          })
        : skinOrigin.name
      : skinOrigin?.kind === "file"
        ? t("foundry.header.fromFile", { name: skinOrigin.name })
        : t("foundry.header.baseGame");

  return (
    <div className='flex min-w-0 items-center gap-3'>
      <div className='h-10 w-10 shrink-0 overflow-hidden rounded-lg border bg-muted'>
        {portrait && (
          <img
            alt=''
            className='h-full w-full object-cover object-top'
            src={portrait}
          />
        )}
      </div>
      <div className='flex min-w-0 flex-col gap-0.5'>
        <div className='flex items-center gap-2'>
          <h2 className='truncate font-semibold text-lg leading-tight'>
            {hero ?? t("foundry.preview.unknownHero")}
          </h2>
          <Badge className='shrink-0' variant='outline'>
            {t("foundry.toolbar.entryCount", {
              count: manifest.entryCount,
              formattedCount: manifest.entryCount.toLocaleString(),
            })}
          </Badge>
          {editedPaths.size > 0 && (
            <Badge className='shrink-0'>
              {t("foundry.toolbar.editCount", { count: editedPaths.size })}
            </Badge>
          )}
        </div>
        <p className='truncate text-muted-foreground text-xs'>{source}</p>
      </div>
    </div>
  );
};

/** Assets, Paint, Cards and Sounds, each with how much of it the skin has. */
const ModeTabs = () => {
  const { t } = useTranslation();
  const { activeTab, setActiveTab, manifest, paintParts } = useFoundry();
  if (!manifest) return null;

  const counts = {
    assets: manifest.entryCount,
    paint: paintParts.length,
    cards: manifest.cards.length,
    sounds: manifest.sounds.length,
  } satisfies Record<FoundryTab, number>;

  return (
    <div
      aria-label={t("foundry.header.modes")}
      className='flex shrink-0 gap-0.5 rounded-lg border bg-card p-[3px]'
      role='tablist'>
      {TABS.map((tab) => {
        const Icon = TAB_ICONS[tab];
        const active = tab === activeTab;
        return (
          <button
            aria-selected={active}
            className={cn(
              "flex items-center gap-[7px] rounded-md px-3 py-1.5 font-medium text-[13px] transition-colors",
              active
                ? "bg-secondary font-semibold text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            key={tab}
            onClick={() => setActiveTab(tab)}
            role='tab'
            type='button'>
            <Icon
              className={cn("h-[15px] w-[15px]", active && "text-primary")}
              weight={active ? "duotone" : "regular"}
            />
            {t(`foundry.tabs.${tab}`)}
            <span
              className={cn(
                "font-mono text-[11px]",
                active ? "text-secondary-foreground" : "opacity-60",
              )}>
              {counts[tab].toLocaleString()}
            </span>
          </button>
        );
      })}
    </div>
  );
};

/** The editor: skin header on top, the active mode's workspace below. */
export const FoundryShell = () => {
  const { t } = useTranslation();
  const { manifest, workspace, busy, activeTab, reset } = useFoundry();
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  if (!manifest) return null;

  return (
    <div className='flex h-full flex-col gap-3'>
      <div className='flex shrink-0 items-center gap-5'>
        <SkinIdentity />
        <ModeTabs />
        <div className='flex flex-1 items-center justify-end gap-2'>
          <Button
            className='text-muted-foreground hover:text-foreground'
            icon={<XCircleIcon className='h-4 w-4' />}
            onClick={reset}
            size='sm'
            variant='ghost'>
            {t("foundry.header.close")}
          </Button>
          <Button
            icon={<RepeatIcon className='h-4 w-4' />}
            onClick={() => setImportOpen(true)}
            size='sm'
            variant='outline'>
            {t("foundry.toolbar.changeSkin")}
          </Button>
          <Button
            disabled={!workspace || busy}
            icon={<ExportIcon className='h-4 w-4' weight='bold' />}
            onClick={() => setExportOpen(true)}
            size='sm'
            title={
              workspace ? undefined : t("foundry.editor.workspacePending")
            }>
            {t("foundry.toolbar.export")}
          </Button>
        </div>
      </div>

      <div className='relative flex min-h-0 flex-1 overflow-hidden rounded-[10px] border bg-background'>
        {activeTab === "assets" && (
          <>
            <div className={cn(SIDE_PANEL_CLASS, "w-[248px] border-r")}>
              <FoundryAssetsRail />
            </div>
            <div className='min-w-0 flex-1'>
              <FoundryPreview />
            </div>
            <div className={cn(SIDE_PANEL_CLASS, "w-[292px] border-l")}>
              <FoundryInspector />
            </div>
          </>
        )}
        {activeTab === "paint" && (
          <FoundryPaintWorkspace sidePanelClassName={SIDE_PANEL_CLASS} />
        )}
        {activeTab === "cards" && (
          <FoundryCardsWorkspace sidePanelClassName={SIDE_PANEL_CLASS} />
        )}
        {activeTab === "sounds" && (
          <FoundrySoundsWorkspace sidePanelClassName={SIDE_PANEL_CLASS} />
        )}
        {exportOpen && (
          <FoundryExportSheet onClose={() => setExportOpen(false)} />
        )}
      </div>

      <FoundryImportDialog onOpenChange={setImportOpen} open={importOpen} />
    </div>
  );
};
