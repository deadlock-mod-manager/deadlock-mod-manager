import { Button } from "@deadlock-mods/ui/components/button";
import { Badge } from "@deadlock-mods/ui/components/badge";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { ExternalLink, Plus } from "@deadlock-mods/ui/icons";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CatalogRefreshButton } from "@/components/mod-browsing/catalog-refresh-button";
import { GameBananaLogo } from "@/components/shared/gamebanana-logo";
import { MOD_SOURCE_AUTHOR_GUIDE, useNativeSources } from "@/lib/mod-sources";
import { AddModSourceDialog } from "./add-mod-source-dialog";
import { ModSourceRow } from "./mod-source-row";
import { SourceIconTile } from "./source-icon-tile";
import Section from "./section";

export const ModSourcesSettings = () => {
  const { t } = useTranslation();
  const sources = useNativeSources();
  const [adding, setAdding] = useState(false);
  return (
    <Section
      searchId='mod-sources'
      title={t("modSources.title")}
      description={t("modSources.description")}
      action={
        <Button size='sm' variant='outline' onClick={() => setAdding(true)}>
          <Plus className='size-4' />
          {t("modSources.add")}
        </Button>
      }>
      {/* Shared columns keep every row's switch, refresh and menu aligned. */}
      <div className='grid grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] gap-x-3 divide-y divide-border/40'>
        <div className='col-span-full grid grid-cols-subgrid items-center py-3'>
          <SourceIconTile>
            <GameBananaLogo />
          </SourceIconTile>
          <div className='min-w-0 space-y-0.5'>
            <p className='flex items-center gap-2 text-sm font-medium'>
              GameBanana
              <Badge variant='secondary'>{t("modSources.builtIn")}</Badge>
            </p>
            <p className='text-xs text-muted-foreground'>gamebanana.com</p>
          </div>
          <div className='col-start-4'>
            <CatalogRefreshButton />
          </div>
        </div>
        {sources.isPending && (
          <Skeleton className='col-span-full my-3 h-12 w-full' />
        )}
        {sources.error && (
          <p
            role='alert'
            className='col-span-full py-3 text-sm text-destructive'>
            {sources.error.message}
          </p>
        )}
        {sources.data
          ?.filter((source) => !source.removed)
          .map((source) => (
            <ModSourceRow key={source.key} source={source} />
          ))}
      </div>
      <Button
        className='mt-2 h-auto gap-1.5 px-0 text-muted-foreground text-xs hover:text-foreground'
        variant='link'
        onClick={() => openUrl(MOD_SOURCE_AUTHOR_GUIDE)}>
        {t("modSources.authorExample")}
        <ExternalLink aria-hidden className='size-3' />
      </Button>
      {adding && <AddModSourceDialog open={adding} onOpenChange={setAdding} />}
    </Section>
  );
};
