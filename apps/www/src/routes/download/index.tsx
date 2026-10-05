import { createFileRoute } from "@tanstack/react-router";
import { DownloadsContainer } from "@/components/downloads/downloads-container";
import { prefetchWithin } from "@/lib/prefetch";
import { orpc } from "@/utils/orpc";
import { seo } from "@/utils/seo";

export const Route = createFileRoute("/download/")({
  component: DownloadIndexComponent,
  loader: ({ context: { queryClient } }) =>
    prefetchWithin(queryClient, orpc.getReleases.queryOptions()),
  head: () =>
    seo({
      title: "Download Deadlock Mod Manager for Windows & Linux",
      description:
        "Get the latest Deadlock Mod Manager release: a Windows installer or a Linux package (Flatpak, .deb or .rpm). Free and open source, built from public code on GitHub.",
      path: "/download",
    }),
});

function DownloadIndexComponent() {
  return <DownloadsContainer />;
}
