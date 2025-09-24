import { createFileRoute } from "@tanstack/react-router";
import { DownloadsContainer } from "@/components/downloads/downloads-container";
import { usePageTracking } from "@/hooks/use-page-tracking";

const DownloadComponent = () => {
  usePageTracking("download");
  return <DownloadsContainer />;
};

export const Route = createFileRoute("/download")({
  component: DownloadComponent,
});
