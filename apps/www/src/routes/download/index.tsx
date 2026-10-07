import { createFileRoute } from "@tanstack/react-router";
import { DownloadsContainer } from "@/components/downloads/downloads-container";
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
  head: ({ loaderData }) => {
    const latest = loaderData?.version
      ? `the latest Deadlock Mod Manager release, v${loaderData.version}`
      : "the latest Deadlock Mod Manager release";
    return seo({
      title: "Download Deadlock Mod Manager for Windows & Linux",
      description: `Get ${latest}: a Windows installer or a Linux package (Flatpak, .deb or .rpm). Free and open source, built from public code on GitHub.`,
      path: "/download",
    });
  },
});

function DownloadIndexComponent() {
  return <DownloadsContainer />;
}
