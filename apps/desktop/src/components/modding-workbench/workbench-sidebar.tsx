import { Button } from "@deadlock-mods/ui/components/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@deadlock-mods/ui/components/tabs";
import {
  ArrowClockwiseIcon,
  ArrowsLeftRightIcon,
  FolderIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import type { UseQueryResult } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { WORKSPACE_SOURCE_DRAG } from "@/lib/modding-workspace";
import type { ModdingAddon } from "@/types/generated/ModdingAddon";
import type { ModdingLibraryVpk } from "@/types/generated/ModdingLibraryVpk";
import type { useWorkbenchArchives } from "./use-workbench-archives";
import { VpkSources } from "./vpk-sources";

export type WorkbenchSourceTab = "addons" | "mods";

interface Props {
  tab: WorkbenchSourceTab;
  onTabChange: (tab: WorkbenchSourceTab) => void;
  addons: UseQueryResult<ModdingAddon[]>;
  addonsEnabled: boolean;
  selectedAddonId?: string;
  activeArchivePath?: string;
  archives: ReturnType<typeof useWorkbenchArchives>;
  busy: boolean;
  preparing: boolean;
  openError: Error | null;
  onCreate: () => void;
  onOpenAddon: (id: string) => void;
  onOpenArchive: (vpk: ModdingLibraryVpk) => void;
}

export function WorkbenchSidebar({
  tab,
  onTabChange,
  addons,
  addonsEnabled,
  selectedAddonId,
  activeArchivePath,
  archives,
  busy,
  preparing,
  openError,
  onCreate,
  onOpenAddon,
  onOpenArchive,
}: Props) {
  const { t } = useTranslation();

  return (
    <aside
      className='flex h-full min-h-0 flex-col bg-card'
      aria-label={t("workbenchHome.sources")}>
      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (value === "addons" || value === "mods") onTabChange(value);
        }}
        className='flex min-h-0 flex-1 flex-col'>
        <div className='shrink-0 border-b p-1.5'>
          <TabsList
            className='grid h-8 w-full grid-cols-2'
            aria-label={t("workbenchHome.sources")}>
            <TabsTrigger value='addons' className='min-w-0 px-2 text-xs'>
              {t("workbenchExplorer.addons")}
            </TabsTrigger>
            <TabsTrigger value='mods' className='min-w-0 px-2 text-xs'>
              {t("workbenchHome.yourMods")}
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent
          forceMount
          value='addons'
          className='mt-0 min-h-0 flex-1 overflow-auto data-[state=inactive]:hidden'>
          <div className='flex items-center justify-between gap-1 border-b px-2 py-2'>
            <Button
              size='sm'
              variant='ghost'
              disabled={!addonsEnabled || busy}
              onClick={onCreate}>
              <PlusIcon aria-hidden />
              {t("workbenchAuthoring.createAddon")}
            </Button>
            <Button
              size='icon'
              variant='ghost'
              className='size-8 shrink-0'
              disabled={!addonsEnabled || addons.isFetching}
              aria-label={t("workbenchExplorer.refresh")}
              title={t("workbenchExplorer.refresh")}
              onClick={() => void addons.refetch()}>
              <ArrowClockwiseIcon aria-hidden />
            </Button>
          </div>
          {addonsEnabled && addons.isPending ? (
            <p role='status' className='p-3 text-xs text-muted-foreground'>
              {t("common.loading")}
            </p>
          ) : null}
          {[...new Set(addons.data?.map((addon) => addon.sdkRoot))].map(
            (root) => (
              <div key={root} className='px-2 py-2'>
                <p
                  title={root}
                  className='truncate px-2 pb-2 pt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground'>
                  {root.split(/[/\\]/).pop()}
                </p>
                {addons.data
                  ?.filter((addon) => addon.sdkRoot === root)
                  .map((addon) => (
                    <button
                      type='button'
                      key={addon.id}
                      draggable={!busy}
                      onDragStart={(event) => {
                        const value = JSON.stringify({
                          kind: "addon",
                          addonId: addon.id,
                          hierarchy: "content",
                          path: "",
                        });
                        event.dataTransfer.effectAllowed = "copy";
                        event.dataTransfer.setData(
                          WORKSPACE_SOURCE_DRAG,
                          value,
                        );
                        event.dataTransfer.setData("text/plain", value);
                      }}
                      disabled={busy}
                      aria-pressed={selectedAddonId === addon.id}
                      title={`${addon.name}\n${addon.sdkRoot}`}
                      className={`mb-0.5 flex w-full items-center gap-2 rounded-md border px-2 py-2 text-left text-xs transition-colors focus-visible:outline focus-visible:outline-ring ${selectedAddonId === addon.id ? "border-primary/30 bg-primary/10 text-primary" : "border-transparent hover:bg-muted"}`}
                      onClick={() => onOpenAddon(addon.id)}>
                      <FolderIcon
                        aria-hidden
                        weight='duotone'
                        className='size-4 shrink-0'
                      />
                      <span className='truncate font-medium'>{addon.name}</span>
                    </button>
                  ))}
              </div>
            ),
          )}
          {addons.error ? (
            <p role='alert' className='p-3 text-xs text-destructive'>
              {addons.error.message}
            </p>
          ) : null}
          {addonsEnabled && !addons.isPending && !addons.data?.length ? (
            <p className='px-3 py-4 text-xs leading-relaxed text-muted-foreground'>
              {t("workbenchExplorer.noAddons")}
            </p>
          ) : null}
          {!addonsEnabled ? (
            <p className='px-3 py-4 text-xs leading-relaxed text-muted-foreground'>
              {t("workbenchHome.addonsHint")}
            </p>
          ) : null}
        </TabsContent>
        <TabsContent
          forceMount
          value='mods'
          className='mt-0 min-h-0 flex-1 overflow-auto data-[state=inactive]:hidden'>
          <VpkSources
            disabled={busy}
            activePath={activeArchivePath}
            external={archives.external}
            opening={archives.browse.isPending}
            error={archives.browse.error}
            onBrowse={() => archives.browse.mutate()}
            onOpen={onOpenArchive}
          />
        </TabsContent>
      </Tabs>
      <p className='flex items-center gap-2 border-t px-3 py-2.5 text-[10px] leading-relaxed text-muted-foreground'>
        <ArrowsLeftRightIcon aria-hidden className='size-3 shrink-0' />
        {t(
          preparing
            ? "workbenchExplorer.preparingAddon"
            : "workbenchExplorer.openAddonHint",
        )}
      </p>
      {openError ? (
        <p role='alert' className='p-3 text-xs text-destructive'>
          {openError.message}
        </p>
      ) : null}
    </aside>
  );
}
