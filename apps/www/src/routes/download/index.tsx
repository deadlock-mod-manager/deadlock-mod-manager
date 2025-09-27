import { createFileRoute } from "@tanstack/react-router";
import { DownloadsContainer } from "@/components/downloads/downloads-container";

export const Route = createFileRoute("/download/")({
  component: DownloadIndexComponent,
});

function DownloadIndexComponent() {
  return <DownloadsContainer />;
}
