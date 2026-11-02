import { Button } from "@deadlock-mods/ui/components/button";
import { Badge } from "@deadlock-mods/ui/components/badge";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { Plus } from "@deadlock-mods/ui/icons";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CatalogRefreshButton } from "@/components/mod-browsing/catalog-refresh-button";
import { GameBananaLogo } from "@/components/shared/gamebanana-logo";
import { MOD_SOURCE_AUTHOR_GUIDE, useNativeSources } from "@/lib/mod-sources";
import { AddModSourceDialog } from "./add-mod-source-dialog";
import { ModSourceRow } from "./mod-source-row";
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
      <div className='divide-y divide-border/40'>
        <div className='flex items-center gap-3 py-3'>
          <GameBananaLogo />
          <div className='min-w-0 flex-1'>
            <p className='text-sm font-medium'>
              GameBanana{" "}
              <Badge variant='secondary'>{t("modSources.builtIn")}</Badge>
            </p>
            <p className='text-xs text-muted-foreground'>gamebanana.com</p>
          </div>
          <CatalogRefreshButton />
        </div>
        {sources.isPending && <Skeleton className='my-3 h-16 w-full' />}
        {sources.error && (
          <p role='alert' className='py-3 text-sm text-destructive'>
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
        className='mt-3 h-auto px-0 text-xs'
        variant='link'
        onClick={() => openUrl(MOD_SOURCE_AUTHOR_GUIDE)}>
        {t("modSources.authorExample")}
      </Button>
      {adding && <AddModSourceDialog open={adding} onOpenChange={setAdding} />}
    </Section>
  );
};
