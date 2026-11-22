import { Button } from "@deadlock-mods/ui/components/button";
import { CheckIcon, GlobeIcon, PackageIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { usePersistedStore } from "@/lib/store";
import type { NativeSourceListing } from "@/types/generated/NativeSourceListing";
import { CardFooter, CardHeader, MetaItem, MetaRow } from "./card-parts";

const hostOf = (url: string | null) => (url ? new URL(url).host : null);

/** A hosted mod pack; its mod page runs the download and the file picker. */
export const PerformancePackCard = ({
  listing,
}: {
  listing: NativeSourceListing;
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const installed = usePersistedStore((state) =>
    state.localMods.some((mod) => mod.remoteId === listing.remoteId),
  );
  const components = listing.release?.installation.components.length ?? 0;
  const host = hostOf(listing.homepageUrl);

  return (
    <article className='flex h-full flex-col gap-3 rounded-lg border bg-card p-4'>
      <CardHeader
        label={
          <span className='inline-flex items-center gap-1.5 font-semibold text-primary text-xs uppercase tracking-wide'>
            <PackageIcon aria-hidden />
            {t("performance.configs.packs.label")}
          </span>
        }
        provenance={
          host && (
            <>
              <GlobeIcon aria-hidden />
              {host}
            </>
          )
        }
      />
      <div className='min-w-0'>
        <h3 className='truncate font-semibold text-base' title={listing.title}>
          {listing.title}
        </h3>
        {listing.author && (
          <p className='truncate text-muted-foreground text-xs'>
            {t("performance.configs.by", { author: listing.author })}
          </p>
        )}
      </div>
      <p className='line-clamp-2 text-muted-foreground text-sm'>
        {listing.description?.split("\n\n")[0]}
      </p>
      <MetaRow>
        <MetaItem icon={<PackageIcon aria-hidden />}>
          {t("performance.configs.packs.mods", { count: components })}
        </MetaItem>
      </MetaRow>
      <CardFooter>
        <Button
          icon={installed ? <CheckIcon aria-hidden /> : undefined}
          onClick={() => navigate(`/mods/${listing.remoteId}`)}
          size='sm'
          variant='outline'>
          {installed
            ? t("performance.configs.packs.installed")
            : t("performance.configs.packs.view")}
        </Button>
      </CardFooter>
    </article>
  );
};
