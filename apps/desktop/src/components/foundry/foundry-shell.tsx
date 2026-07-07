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
  RepeatIcon,
  SparkleIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FoundryEntry, FoundryTab } from "@/types/foundry";
import { FoundryCardsPanel } from "./foundry-cards-panel";
import { useFoundry } from "./foundry-context";
import { FoundryEntryList } from "./foundry-entry-list";
import { FoundryImportDialog } from "./foundry-import-dialog";
import { FoundryInspector } from "./foundry-inspector";
import { FoundryPreview } from "./foundry-preview";

const TAB_ICONS: Record<FoundryTab, React.ReactNode> = {
  skin: <CubeIcon className='h-4 w-4' weight='duotone' />,
  cards: <ImageIcon className='h-4 w-4' weight='duotone' />,
  effects: <SparkleIcon className='h-4 w-4' weight='duotone' />,
  sounds: <MusicNotesIcon className='h-4 w-4' weight='duotone' />,
};

const TABS_LIST_CLASS_NAME =
  "grid w-full max-w-[22rem] grid-cols-4 rounded-none rounded-t-lg";

const prioritizePreviewableModels = (entries: FoundryEntry[]): FoundryEntry[] =>
  [...entries].sort((a, b) => {
    const aPreviewable = a.path.endsWith(".vmesh_c") ? 0 : 1;
    const bPreviewable = b.path.endsWith(".vmesh_c") ? 0 : 1;
    return aPreviewable - bPreviewable;
  });

export const FoundryShell = () => {
  const { t } = useTranslation();
  const {
    manifest,
    activeTab,
    reset,
    setActiveTab,
    selectedEntryPath,
    setSelectedEntryPath,
  } = useFoundry();
  const [importOpen, setImportOpen] = useState(false);

  const entriesForTab = useMemo<FoundryEntry[]>(() => {
    if (!manifest) return [];
    switch (activeTab) {
      case "skin":
        return [
          ...prioritizePreviewableModels(manifest.models),
          ...manifest.materials,
        ];
      case "cards":
        return manifest.cards;
      case "effects":
        return manifest.particles;
      case "sounds":
        return manifest.sounds;
      default:
        return [];
    }
  }, [manifest, activeTab]);

  if (!manifest) return null;

  const showPreviewPanel = activeTab !== "cards" && activeTab !== "sounds";
  const onSelect = (entry: FoundryEntry) => setSelectedEntryPath(entry.path);

  return (
    <div className='flex h-full flex-col gap-3'>
      {/* Toolbar */}
      <div className='flex items-center justify-between gap-3'>
        <div className='flex items-center gap-2'>
          <h2 className='font-semibold text-lg'>
            {manifest.heroDisplay ?? t("foundry.preview.unknownHero")}
          </h2>
          <Badge variant='secondary'>
            {t("foundry.toolbar.entryCount", { count: manifest.entryCount })}
          </Badge>
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
          <Button disabled size='sm' variant='default'>
            {t("foundry.toolbar.export")}
          </Button>
        </div>
      </div>

      {/* Workspace */}
      <ResizablePanelGroup
        className='flex-1 rounded-lg border'
        direction='horizontal'
        key={showPreviewPanel ? "with-preview" : "without-preview"}>
        <ResizablePanel
          defaultSize={showPreviewPanel ? 26 : 74}
          minSize={showPreviewPanel ? 18 : 40}>
          <Tabs
            className='flex h-full flex-col'
            onValueChange={(value) => setActiveTab(value as FoundryTab)}
            value={activeTab}>
            <TabsList className={TABS_LIST_CLASS_NAME}>
              {(["skin", "cards", "effects", "sounds"] as FoundryTab[]).map(
                (tab) => (
                  <TabsTrigger
                    className='gap-1.5'
                    key={tab}
                    title={t(`foundry.tabs.${tab}`)}
                    value={tab}>
                    {TAB_ICONS[tab]}
                  </TabsTrigger>
                ),
              )}
            </TabsList>
            {(["skin", "cards", "effects", "sounds"] as FoundryTab[]).map(
              (tab) => (
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
                      {tab === "cards" ? (
                        <FoundryCardsPanel />
                      ) : (
                        <FoundryEntryList
                          emptyLabel={t(`foundry.tabs.${tab}Empty`)}
                          entries={entriesForTab}
                          onSelect={onSelect}
                          selectedPath={selectedEntryPath}
                        />
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>
              ),
            )}
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

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={26} minSize={18}>
          <FoundryInspector />
        </ResizablePanel>
      </ResizablePanelGroup>

      <FoundryImportDialog onOpenChange={setImportOpen} open={importOpen} />
    </div>
  );
};
