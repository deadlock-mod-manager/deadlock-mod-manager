import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@deadlock-mods/ui/components/resizable";
import { ScrollArea } from "@deadlock-mods/ui/components/scroll-area";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@deadlock-mods/ui/components/tabs";
import {
  CubeIcon,
  ImageIcon,
  MusicNotesIcon,
  PaintBrushIcon,
  RepeatIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FoundryEntry, FoundryTab } from "@/types/foundry";
import { FoundryCardsPanel } from "./foundry-cards-panel";
import { useFoundry } from "./foundry-context";
import { FoundryEntryList } from "./foundry-entry-list";
import { FoundryExportDialog } from "./foundry-export-dialog";
import { FoundryImportDialog } from "./foundry-import-dialog";
import { FoundryInspector } from "./foundry-inspector";
import { FoundryPaintPanel } from "./foundry-paint-panel";
import { FoundryPreview } from "./foundry-preview";
import { FoundrySoundsPanel } from "./foundry-sounds-panel";

const TABS: FoundryTab[] = ["assets", "paint", "cards", "sounds"];

const TAB_ICONS: Record<FoundryTab, React.ReactNode> = {
  assets: <CubeIcon className='h-4 w-4' weight='duotone' />,
  paint: <PaintBrushIcon className='h-4 w-4' weight='duotone' />,
  cards: <ImageIcon className='h-4 w-4' weight='duotone' />,
  sounds: <MusicNotesIcon className='h-4 w-4' weight='duotone' />,
};

const TABS_LIST_CLASS_NAME =
  "grid w-full max-w-[22rem] grid-cols-4 rounded-none rounded-t-lg";

/**
 * A `.vmdl_c` assembles the whole character, so it leads the list; the loose
 * `.vmesh_c` parts follow, then the materials.
 */
const modelRank = (entry: FoundryEntry): number =>
  entry.path.endsWith(".vmdl_c") ? 0 : entry.path.endsWith(".vmesh_c") ? 1 : 2;

const prioritizeWholeModels = (entries: FoundryEntry[]): FoundryEntry[] =>
  [...entries].sort((a, b) => modelRank(a) - modelRank(b));

export const FoundryShell = () => {
  const { t } = useTranslation();
  const {
    manifest,
    workspace,
    busy,
    activeTab,
    reset,
    setActiveTab,
    selectedEntryPath,
    setSelectedEntryPath,
    editedPaths,
    primaryModelPath,
  } = useFoundry();
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const entriesForTab = useMemo<FoundryEntry[]>(() => {
    if (!manifest) return [];
    if (activeTab === "assets") {
      // Everything the VPK holds, models first, so the skin file is one click
      // away and the rest is still there to inspect.
      return [
        ...prioritizeWholeModels(manifest.models),
        ...manifest.materials,
        ...manifest.textures,
        ...manifest.cards,
        ...manifest.sounds,
        ...manifest.other,
      ];
    }
    return [];
  }, [manifest, activeTab]);

  const heroName = manifest?.heroDisplay ?? manifest?.hero ?? null;

  if (!manifest) return null;

  // The 3D preview stays up for the asset browser and the paint tab; cards and
  // sounds get the full width instead.
  const showPreviewPanel = activeTab === "assets" || activeTab === "paint";
  // Painting works on parts, not files, so the per-entry inspector is dropped
  // and the 3D preview takes the space instead.
  const showInspector = activeTab !== "paint";
  const onSelect = (entry: FoundryEntry) => setSelectedEntryPath(entry.path);

  return (
    <div className='flex h-full flex-col gap-3'>
      {/* Toolbar */}
      <div className='flex items-center justify-between gap-3'>
        <div className='flex items-center gap-2'>
          <h2 className='font-semibold text-lg'>
            {heroName ?? t("foundry.preview.unknownHero")}
          </h2>
          <Badge variant='secondary'>
            {t("foundry.toolbar.entryCount", { count: manifest.entryCount })}
          </Badge>
          {editedPaths.size > 0 && (
            <Badge>
              {t("foundry.toolbar.editCount", { count: editedPaths.size })}
            </Badge>
          )}
        </div>
        <div className='flex items-center gap-2'>
          <Button
            icon={<RepeatIcon className='h-4 w-4' />}
            onClick={() => setImportOpen(true)}
            size='sm'
            variant='outline'>
            {t("foundry.toolbar.changeSkin")}
          </Button>
          <Button
            icon={<XCircleIcon className='h-4 w-4' />}
            onClick={reset}
            size='sm'
            variant='outline'>
            {t("foundry.toolbar.clear")}
          </Button>
          <Button
            disabled={!workspace || busy}
            onClick={() => setExportOpen(true)}
            size='sm'
            title={workspace ? undefined : t("foundry.editor.workspacePending")}
            variant='default'>
            {t("foundry.toolbar.export")}
          </Button>
        </div>
      </div>

      {/* Workspace */}
      <ResizablePanelGroup
        className='flex-1 rounded-lg border'
        direction='horizontal'
        key={`${showPreviewPanel ? "preview" : "no-preview"}-${
          showInspector ? "inspector" : "no-inspector"
        }`}>
        <ResizablePanel
          defaultSize={showPreviewPanel ? 26 : 74}
          minSize={showPreviewPanel ? 18 : 40}>
          <Tabs
            className='flex h-full flex-col'
            onValueChange={(value) => setActiveTab(value as FoundryTab)}
            value={activeTab}>
            <TabsList className={TABS_LIST_CLASS_NAME}>
              {TABS.map((tab) => (
                <TabsTrigger
                  className='gap-1.5'
                  key={tab}
                  title={t(`foundry.tabs.${tab}`)}
                  value={tab}>
                  {TAB_ICONS[tab]}
                </TabsTrigger>
              ))}
            </TabsList>
            {TABS.map((tab) => (
              <TabsContent
                className='mt-0 flex-1 overflow-hidden data-[state=inactive]:hidden'
                key={tab}
                value={tab}>
                <div className='border-b px-3 py-2'>
                  <p className='font-medium text-sm'>
                    {t(`foundry.tabs.${tab}`)}
                  </p>
                  <p className='text-muted-foreground text-xs'>
                    {t(`foundry.tabs.${tab}Hint`)}
                  </p>
                </div>
                <ScrollArea className='h-[calc(100%-3.25rem)]'>
                  <div className='p-2'>
                    {tab === "paint" ? (
                      <FoundryPaintPanel />
                    ) : tab === "cards" ? (
                      <FoundryCardsPanel />
                    ) : tab === "sounds" ? (
                      <FoundrySoundsPanel />
                    ) : (
                      <FoundryEntryList
                        editedPaths={editedPaths}
                        emptyLabel={t(`foundry.tabs.${tab}Empty`)}
                        entries={entriesForTab}
                        onSelect={onSelect}
                        primaryPath={primaryModelPath}
                        selectedPath={selectedEntryPath}
                      />
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
            ))}
          </Tabs>
        </ResizablePanel>

        {showPreviewPanel && (
          <>
            <ResizableHandle withHandle />

            <ResizablePanel defaultSize={48} minSize={30}>
              <div className='h-full p-3'>
                <FoundryPreview />
              </div>
            </ResizablePanel>
          </>
        )}

        {showInspector && (
          <>
            <ResizableHandle withHandle />

            <ResizablePanel defaultSize={26} minSize={18}>
              <FoundryInspector />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>

      <FoundryImportDialog onOpenChange={setImportOpen} open={importOpen} />
      <FoundryExportDialog onOpenChange={setExportOpen} open={exportOpen} />
    </div>
  );
};
