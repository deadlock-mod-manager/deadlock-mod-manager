import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/download")({
  component: DownloadLayout,
});

function DownloadLayout() {
  return <Outlet />;
}
