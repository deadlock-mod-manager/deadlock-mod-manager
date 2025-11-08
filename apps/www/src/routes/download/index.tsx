import { createFileRoute } from "@tanstack/react-router";
import { DownloadsContainer } from "@/components/downloads/downloads-container";
import { seo } from "@/utils/seo";

export const Route = createFileRoute("/download/")({
  component: DownloadIndexComponent,
  head: () =>
    seo({
      title: "Download | Deadlock Mod Manager",
      description:
        "Download Deadlock Mod Manager for Windows, macOS, or Linux. Cross-platform mod management for Valve's Deadlock game.",
    }),
});

function DownloadIndexComponent() {
  return <DownloadsContainer />;
}
