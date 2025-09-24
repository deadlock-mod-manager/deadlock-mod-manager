import { createFileRoute } from "@tanstack/react-router";
import { DownloadsContainer } from "@/components/downloads/downloads-container";
import { usePageTracking } from "@/hooks/use-page-tracking";

export const Route = createFileRoute("/download/")({
  component: DownloadIndexComponent,
});

function DownloadIndexComponent() {
  usePageTracking("download");
  return <DownloadsContainer />;
}