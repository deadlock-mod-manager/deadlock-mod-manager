import { Button } from "@deadlock-mods/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
import { Label } from "@deadlock-mods/ui/components/label";
import { SearchInput } from "@deadlock-mods/ui/components/search-input";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { Switch } from "@deadlock-mods/ui/components/switch";
import {
  ArrowLeft,
  Check,
  Download,
  ExternalLink,
  Library,
  Loader2,
  Package,
} from "@deadlock-mods/ui/icons";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import Fuse from "fuse.js";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { AuthorStatPill } from "@/components/mod-author/author-stat-pill";
import ModCard from "@/components/mod-browsing/mod-card";
import { GameBananaMarkup } from "@/components/mod-detail/gamebanana-markup";
import { useConfirm } from "@/components/providers/alert-dialog";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useCollectionDownload } from "@/hooks/use-collection-download";
import { getCollectionFreshness } from "@/lib/collections/freshness";
import {
  collectionModsQueryOptions,
  collectionQueryOptions,
} from "@/lib/collections/queries";
import { filterHiddenNSFWItems } from "@/lib/mods/nsfw-visibility";
import { usePersistedStore } from "@/lib/store";
import { findLocalMod } from "@/lib/store/selectors";
import { isModOutdated } from "@/lib/utils";
import { CollectionCover } from "./collection-cover";
import { CollectionFreshnessIndicator } from "./collection-freshness";
import { CollectionNotFound } from "./collection-not-found";
import { SelectableModCard } from "./selectable-mod-card";

// Same fuzziness as the local mod search.
const MOD_SEARCH_THRESHOLD = 0.35;

export const CollectionPageContent = ({ id }: { id: string }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const goBack = () => navigate("/mods");
  const { data: detail } = useSuspenseQuery(collectionQueryOptions(id));
  const { data: catalogMods } = useSuspenseQuery(
    collectionModsQueryOptions(detail?.items ?? []),
  );
  const hideNSFW = usePersistedStore((state) => state.nsfwSettings.hideNSFW);
  const collectionMods = filterHiddenNSFWItems(catalogMods, hideNSFW) ?? [];
  // Shared with the mods store's "Hide Outdated" filter.
  const hideOutdated = usePersistedStore(
    (state) => state.modsFilters.hideOutdated,
  );
  const updateModsFilters = usePersistedStore(
    (state) => state.updateModsFilters,
  );
  const mods = hideOutdated
    ? collectionMods.filter((mod) => !isModOutdated(mod))
    : collectionMods;
  const localMods = usePersistedStore((state) => state.localMods);
  const inLibrary = collectionMods.filter((mod) =>
    findLocalMod(localMods, mod.remoteId),
  );
  const pending = mods.filter(
    (mod) => mod.downloadable && !inLibrary.includes(mod),
  );
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300).trim();
  const fuse = useMemo(
    () =>
      new Fuse(mods, {
        keys: ["name", "author"],
        threshold: MOD_SEARCH_THRESHOLD,
      }),
    [mods],
  );
  const visibleMods = debouncedQuery
    ? fuse.search(debouncedQuery).map((result) => result.item)
    : mods;
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  // Picks are kept while searching, but only mods still pending count.
  const selected = pending.filter((mod) => selectedIds.has(mod.remoteId));
  const selecting = selected.length > 0;
  const targets = selecting ? selected : pending;
  const toggleSelected = (remoteId: string) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      if (!next.delete(remoteId)) next.add(remoteId);
      return next;
    });
  const clearSelection = () => setSelectedIds(new Set());
  const collectionDownload = useCollectionDownload();
  const openCollection = useMutation({
    mutationFn: (url: string) => openUrl(url),
    meta: { skipGlobalErrorHandler: true },
    onError: () => toast.error(t("collections.openSiteError")),
  });

  if (!detail) {
    return <CollectionNotFound onBack={goBack} />;
  }

  const { collection, text, items } = detail;

  const missingCount = items.length - catalogMods.length;
  const freshness = getCollectionFreshness(collectionMods);
  const targetsOutdated = targets.filter(isModOutdated).length;
  const skippedCount = selecting
    ? 0
    : mods.filter((mod) => inLibrary.includes(mod)).length;
  const collectionNavigation = { id: collection.id, name: collection.name };
  const backdropUrl = collection.coverUrl ?? collection.previewImages[0];

  const handleDownload = async () => {
    const accepted = await confirm({
      title: t("collections.download.confirmTitle", {
        collection: collection.name,
      }),
      body: [
        t("collections.download.confirmBody", { count: targets.length }),
        skippedCount > 0
          ? t("collections.download.confirmSkipped", { count: skippedCount })
          : null,
        targetsOutdated > 0
          ? t("collections.download.confirmOutdated", {
              count: targetsOutdated,
            })
          : null,
      ]
        .filter(Boolean)
        .join(" "),
      actionButton: t("collections.download.confirmAction", {
        count: targets.length,
      }),
      actionButtonVariant: "default",
    });
    if (accepted) {
      collectionDownload.mutate(targets);
      clearSelection();
    }
  };

  const downloadLabel = collectionDownload.isPending
    ? t("collections.download.preparing", {
        done: collectionDownload.prepared,
        total: collectionDownload.variables.length,
      })
    : pending.length === 0
      ? t("collections.download.allInLibrary")
      : selecting
        ? t("collections.download.selectedAction", { count: selected.length })
        : t("collections.download.action", { count: pending.length });

  return (
    <div className='flex h-full min-h-0 w-full flex-col px-4'>
      <div className='mb-4 flex items-center pt-2'>
        <Button
          className='flex items-center gap-1'
          onClick={goBack}
          size='sm'
          variant='ghost'>
          <ArrowLeft className='h-4 w-4' />
          {t("collections.backToCollections")}
        </Button>
      </div>

      <div className='min-h-0 flex-1 overflow-auto pb-24'>
        <section className='relative mb-6 overflow-hidden rounded-lg border bg-card'>
          {backdropUrl && !(collection.isNsfw && collection.coverUrl) && (
            <img
              alt=''
              aria-hidden='true'
              className='absolute inset-0 h-full w-full object-cover opacity-20 blur-sm [mask-image:linear-gradient(to_right,transparent_0%,black_50%,black_100%)]'
              src={backdropUrl}
            />
          )}
          <div className='relative flex flex-wrap items-center gap-6 bg-gradient-to-t from-background via-background/85 to-background/30 p-6'>
            <div className='aspect-[3/4] w-32 shrink-0 overflow-hidden rounded-md border bg-muted shadow-md'>
              <CollectionCover
                className='h-full w-full'
                collection={collection}
                iconClassName='h-10 w-10'
              />
            </div>
            <div className='min-w-0 flex-1'>
              <p className='mb-1 text-muted-foreground text-sm'>
                {t("collections.byAuthor", { author: collection.author })}
              </p>
              <h1 className='font-semibold text-3xl tracking-tight'>
                {collection.name}
              </h1>
              {collection.description && (
                <p className='mt-2 max-w-2xl text-muted-foreground'>
                  {collection.description}
                </p>
              )}
              <div className='mt-3 flex flex-wrap items-center gap-2'>
                <AuthorStatPill
                  icon={<Package className='h-3.5 w-3.5' />}
                  label={t("collections.modStat", {
                    count: collectionMods.length,
                  })}
                  value={collectionMods.length.toLocaleString()}
                />
                <AuthorStatPill
                  icon={<Library className='h-3.5 w-3.5' />}
                  label={t("collections.inLibraryStat", {
                    count: inLibrary.length,
                  })}
                  value={inLibrary.length.toLocaleString()}
                />
                {freshness && (
                  <CollectionFreshnessIndicator
                    className='rounded-full border border-border/60 bg-background/65 px-2.5 py-1 text-muted-foreground shadow-sm'
                    freshness={freshness}
                  />
                )}
              </div>
            </div>
            <div className='flex shrink-0 flex-col items-stretch gap-2'>
              <Button
                disabled={collectionDownload.isPending || pending.length === 0}
                onClick={handleDownload}>
                {collectionDownload.isPending ? (
                  <Loader2 className='h-4 w-4 animate-spin' />
                ) : pending.length === 0 ? (
                  <Check className='h-4 w-4' />
                ) : (
                  <Download className='h-4 w-4' />
                )}
                {downloadLabel}
              </Button>
              <Button
                disabled={openCollection.isPending}
                onClick={() => openCollection.mutate(collection.profileUrl)}
                variant='outline'>
                {t("collections.viewOnGameBanana")}
                <ExternalLink className='h-4 w-4' />
              </Button>
            </div>
          </div>
        </section>

        {text && text !== collection.description && (
          <section className='mb-6 max-w-3xl px-1'>
            <GameBananaMarkup content={text} />
          </section>
        )}

        <div className='mb-4 flex items-baseline justify-between gap-4'>
          <h2 className='font-semibold text-xl'>
            {t("collections.modsInCollection")}
          </h2>
          {!collection.itemsSynced ? (
            <span className='text-muted-foreground text-sm'>
              {t("collections.itemsSyncing")}
            </span>
          ) : (
            missingCount > 0 && (
              <span className='text-muted-foreground text-sm'>
                {t("collections.missingFromCatalog", { count: missingCount })}
              </span>
            )
          )}
        </div>

        <div className='sticky top-0 z-30 mb-4 flex flex-wrap items-center gap-2 bg-background/90 px-1 py-2 backdrop-blur-sm'>
          <div className='min-w-48 max-w-sm flex-1'>
            <SearchInput
              className='w-full'
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("collections.searchMods")}
              value={query}
            />
          </div>
          <div className='flex items-center gap-2 px-2'>
            <Switch
              checked={hideOutdated}
              id='collectionHideOutdated'
              onCheckedChange={(checked) =>
                updateModsFilters({ hideOutdated: checked })
              }
            />
            <Label className='font-normal' htmlFor='collectionHideOutdated'>
              {t("filters.hideOutdated")}
            </Label>
          </div>
          {selecting && (
            <>
              <span className='text-muted-foreground text-sm tabular-nums'>
                {t("collections.selectedCount", { count: selected.length })}
              </span>
              <Button
                onClick={() =>
                  setSelectedIds(
                    (current) =>
                      new Set([
                        ...current,
                        ...visibleMods
                          .filter((mod) => pending.includes(mod))
                          .map((mod) => mod.remoteId),
                      ]),
                  )
                }
                size='sm'
                variant='outline'>
                {t("collections.selectAll")}
              </Button>
              <Button onClick={clearSelection} size='sm' variant='ghost'>
                {t("collections.clearSelection")}
              </Button>
              <Button
                disabled={collectionDownload.isPending}
                onClick={handleDownload}
                size='sm'>
                <Download className='h-4 w-4' />
                {t("collections.download.selectedAction", {
                  count: selected.length,
                })}
              </Button>
            </>
          )}
        </div>

        {visibleMods.length === 0 ? (
          <Empty className='py-12'>
            <EmptyHeader>
              <EmptyMedia variant='default'>
                <MagnifyingGlass className='h-16 w-16' />
              </EmptyMedia>
              <EmptyTitle>{t("collections.noModsTitle")}</EmptyTitle>
              <EmptyDescription>
                {t("collections.noModsDescription")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className='grid grid-cols-1 gap-4 px-1 pr-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'>
            {visibleMods.map((mod) => (
              <SelectableModCard
                key={mod.id}
                mod={mod}
                onToggle={toggleSelected}
                selectable={pending.includes(mod)}
                selected={selectedIds.has(mod.remoteId)}
                selecting={selecting}>
                <ModCard curatedCollection={collectionNavigation} mod={mod} />
              </SelectableModCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
