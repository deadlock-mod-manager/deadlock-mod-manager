import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Trans, useTranslation } from "react-i18next";
import { selectRecommendedDownload } from "@/lib/release-downloads";
import { headI18n } from "@/lib/i18n/route";
import { prefetchWithin } from "@/lib/prefetch";
import { orpc } from "@/utils/orpc";
import { seo } from "@/utils/seo";

export const Route = createFileRoute("/download/linux")({
  component: DownloadLinuxComponent,
  loader: ({ context: { queryClient } }) =>
    prefetchWithin(queryClient, orpc.getReleases.queryOptions()),
  head: ({ match }) => {
    const { t, locale } = headI18n(match, "download");
    return seo({
      title: t("redirect.linux.metaTitle"),
      description: t("redirect.linux.metaDescription"),
      noindex: true,
      locale,
    });
  },
});

function DownloadLinuxComponent() {
  const navigate = useNavigate();
  const { t } = useTranslation("download");
  const {
    data: releases,
    isLoading,
    error,
  } = useQuery(orpc.getReleases.queryOptions());

  useEffect(() => {
    if (isLoading || error) return;

    if (
      !releases?.latest?.downloads ||
      releases.latest.downloads.length === 0
    ) {
      navigate({ to: "/download" });
      return;
    }

    // Find Linux downloads
    const linuxDownloads = releases.latest.downloads.filter(
      (download) => download.platform === "linux",
    );

    if (linuxDownloads.length === 0) {
      navigate({ to: "/download" });
      return;
    }

    const preferredDownload = selectRecommendedDownload(
      linuxDownloads,
      "linux",
      "x64",
    );

    if (!preferredDownload) {
      navigate({ to: "/download" });
      return;
    }

    window.location.href = preferredDownload.url;
  }, [releases, isLoading, error, navigate]);

  if (isLoading) {
    return (
      <div className='container mx-auto px-4 py-20 text-center'>
        <div className='flex flex-col items-center justify-center space-y-4'>
          <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-primary'></div>
          <p className='text-lg'>{t("redirect.linux.preparing")}</p>
          <p className='text-muted-foreground'>{t("redirect.fetching")}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='container mx-auto px-4 py-20 text-center'>
        <div className='flex flex-col items-center justify-center space-y-4'>
          <h1 className='text-2xl font-bold text-destructive'>
            {t("redirect.errorTitle")}
          </h1>
          <p className='text-muted-foreground'>
            {t("redirect.errorDescription")}
          </p>
          <button
            onClick={() => navigate({ to: "/download" })}
            className='bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-2 rounded-md transition-colors'>
            {t("redirect.goToDownloads")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className='container mx-auto px-4 py-20 text-center'>
      <div className='flex flex-col items-center justify-center space-y-4'>
        <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-primary'></div>
        <p className='text-lg'>{t("redirect.linux.redirecting")}</p>
        <p className='text-muted-foreground'>
          <Trans
            components={{
              button: (
                <button
                  className='text-primary hover:underline'
                  onClick={() => navigate({ to: "/download" })}
                  type='button'
                />
              ),
            }}
            i18nKey='redirect.fallback'
            t={t}
          />
        </p>
      </div>
    </div>
  );
}
