import { Button } from "@deadlock-mods/ui/components/button";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  ArrowLeft,
  Check,
  Download,
  ExternalLink,
  Library,
  Loader2,
  Package,
} from "@deadlock-mods/ui/icons";
import { CardsThreeIcon } from "@phosphor-icons/react";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { AuthorStatPill } from "@/components/mod-author/author-stat-pill";
import ModCard from "@/components/mod-browsing/mod-card";
import { useConfirm } from "@/components/providers/alert-dialog";
import { useAlbumDownload } from "@/hooks/use-album-download";
import {
  albumModsQueryOptions,
  albumPageUrl,
  deadlockSkinsAlbumMembersQueryOptions,
  deadlockSkinsAlbumsQueryOptions,
} from "@/lib/deadlockskins/albums";
import { usePersistedStore } from "@/lib/store";
import { findLocalMod } from "@/lib/store/selectors";
import { AlbumNotFound } from "./album-not-found";

export const AlbumPageContent = ({ slug }: { slug: string }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const goBack = () => navigate("/mods");
  // The album page has no poster of its own, so the header reads from the
  // cached album list and the page itself only supplies the members.
  const { data: albums } = useSuspenseQuery(deadlockSkinsAlbumsQueryOptions());
  const album = albums.find((entry) => entry.slug === slug);
  const { data: members } = useSuspenseQuery(
    deadlockSkinsAlbumMembersQueryOptions(slug),
  );
  const { data: mods } = useSuspenseQuery(albumModsQueryOptions(members ?? []));
  const localMods = usePersistedStore((state) => state.localMods);
  const inLibrary = mods.filter((mod) => findLocalMod(localMods, mod.remoteId));
  const pending = mods.filter(
    (mod) => mod.downloadable && !inLibrary.includes(mod),
  );
  const albumDownload = useAlbumDownload();
  const openAlbum = useMutation({
    mutationFn: (url: string) => openUrl(url),
    meta: { skipGlobalErrorHandler: true },
    onError: () => toast.error(t("albums.openSiteError")),
  });

  if (!album || !members) {
    return <AlbumNotFound onBack={goBack} />;
  }

  const missingCount = members.length - mods.length;
  const albumNavigation = { slug: album.slug, name: album.name };

  const handleDownloadAll = async () => {
    const accepted = await confirm({
      title: t("albums.download.confirmTitle", { album: album.name }),
      body: [
        t("albums.download.confirmBody", { count: pending.length }),
        inLibrary.length > 0
          ? t("albums.download.confirmSkipped", { count: inLibrary.length })
          : null,
      ]
        .filter(Boolean)
        .join(" "),
      actionButton: t("albums.download.confirmAction", {
        count: pending.length,
      }),
      actionButtonVariant: "default",
    });
    if (accepted) {
      albumDownload.mutate({ mods: pending, members });
    }
  };

  const downloadLabel = albumDownload.isPending
    ? t("albums.download.preparing", {
        done: albumDownload.prepared,
        total: albumDownload.variables.mods.length,
      })
    : pending.length === 0
      ? t("albums.download.allInLibrary")
      : t("albums.download.action", { count: pending.length });

  return (
    <div className='flex h-full min-h-0 w-full flex-col px-4'>
      <div className='mb-4 flex items-center pt-2'>
        <Button
          className='flex items-center gap-1'
          onClick={goBack}
          size='sm'
          variant='ghost'>
          <ArrowLeft className='h-4 w-4' />
          {t("albums.backToAlbums")}
        </Button>
      </div>

      <div className='min-h-0 flex-1 overflow-auto pb-24'>
        <section className='relative mb-6 overflow-hidden rounded-lg border bg-card'>
          {album.coverUrl && (
            <img
              alt=''
              aria-hidden='true'
              className='absolute inset-0 h-full w-full object-cover opacity-20 blur-sm [mask-image:linear-gradient(to_right,transparent_0%,black_50%,black_100%)]'
              src={album.coverUrl}
            />
          )}
          <div className='relative flex flex-wrap items-center gap-6 bg-gradient-to-t from-background via-background/85 to-background/30 p-6'>
            <div className='aspect-[3/4] w-32 shrink-0 overflow-hidden rounded-md border bg-muted shadow-md'>
              {album.coverUrl ? (
                <img
                  alt=''
                  className='h-full w-full object-cover object-top'
                  src={album.coverUrl}
                />
              ) : (
                <div className='flex h-full items-center justify-center'>
                  <CardsThreeIcon
                    className='h-10 w-10 text-muted-foreground'
                    weight='duotone'
                  />
                </div>
              )}
            </div>
            <div className='min-w-0 flex-1'>
              <p className='mb-1 text-muted-foreground text-sm'>
                {t("albums.album")}
              </p>
              <h1 className='font-semibold text-3xl tracking-tight'>
                {album.name}
              </h1>
              {album.description && (
                <p className='mt-2 max-w-2xl text-muted-foreground'>
                  {album.description}
                </p>
              )}
              <div className='mt-3 flex flex-wrap items-center gap-2'>
                <AuthorStatPill
                  icon={<Package className='h-3.5 w-3.5' />}
                  label={t("albums.modStat", { count: mods.length })}
                  value={mods.length.toLocaleString()}
                />
                <AuthorStatPill
                  icon={<Library className='h-3.5 w-3.5' />}
                  label={t("albums.inLibraryStat", { count: inLibrary.length })}
                  value={inLibrary.length.toLocaleString()}
                />
              </div>
            </div>
            <div className='flex shrink-0 flex-col items-stretch gap-2'>
              <Button
                disabled={albumDownload.isPending || pending.length === 0}
                onClick={handleDownloadAll}>
                {albumDownload.isPending ? (
                  <Loader2 className='h-4 w-4 animate-spin' />
                ) : pending.length === 0 ? (
                  <Check className='h-4 w-4' />
                ) : (
                  <Download className='h-4 w-4' />
                )}
                {downloadLabel}
              </Button>
              <Button
                disabled={openAlbum.isPending}
                onClick={() => openAlbum.mutate(albumPageUrl(album.slug))}
                variant='outline'>
                {t("albums.viewOnSite")}
                <ExternalLink className='h-4 w-4' />
              </Button>
            </div>
          </div>
        </section>

        <div className='mb-4 flex items-baseline justify-between gap-4'>
          <h2 className='font-semibold text-xl'>{t("albums.modsInAlbum")}</h2>
          {missingCount > 0 && (
            <span className='text-muted-foreground text-sm'>
              {t("albums.missingFromCatalog", { count: missingCount })}
            </span>
          )}
        </div>

        <div className='grid grid-cols-1 gap-4 px-1 pr-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'>
          {mods.map((mod) => (
            <ModCard album={albumNavigation} key={mod.id} mod={mod} />
          ))}
        </div>
      </div>
    </div>
  );
};
