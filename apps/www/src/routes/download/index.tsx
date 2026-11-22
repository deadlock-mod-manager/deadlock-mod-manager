import { createFileRoute } from "@tanstack/react-router";
import { DownloadsContainer } from "@/components/downloads/downloads-container";
import { headI18n } from "@/lib/i18n/route";
import { prefetchWithin } from "@/lib/prefetch";
import { orpc } from "@/utils/orpc";
import { seo } from "@/utils/seo";

export const Route = createFileRoute("/download/")({
  component: DownloadIndexComponent,
  loader: async ({ context: { queryClient } }) => {
    const releasesQuery = orpc.getReleases.queryOptions();
    await prefetchWithin(queryClient, releasesQuery);
    // Handed to head() so the release number lands in the indexed metadata.
    return {
      version: queryClient.getQueryData(releasesQuery.queryKey)?.latest.version,
    };
  },
  head: ({ match, loaderData }) => {
    const { t, locale } = headI18n(match, "download");
    const latest = loaderData?.version
      ? t("meta.latestVersion", { version: loaderData.version })
      : t("meta.latest");
    return seo({
      title: t("meta.title"),
      description: t("meta.description", { latest }),
      path: "/download",
      locale,
    });
  },
});

function DownloadIndexComponent() {
  return <DownloadsContainer />;
}
