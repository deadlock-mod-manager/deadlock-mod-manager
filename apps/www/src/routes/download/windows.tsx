import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/download/windows")({
  component: DownloadWindowsComponent,
});

function DownloadWindowsComponent() {
  const navigate = useNavigate();
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

    const windowsDownloads = releases.latest.downloads.filter(
      (download) => download.platform === "windows",
    );

    if (windowsDownloads.length === 0) {
      navigate({ to: "/download" });
      return;
    }

    const preferredDownload =
      windowsDownloads.find((download) => download.architecture === "x64") ||
      windowsDownloads[0];

    window.location.href = preferredDownload.url;
  }, [releases, isLoading, error, navigate]);

  if (isLoading) {
    return (
      <div className='container mx-auto px-4 py-20 text-center'>
        <div className='flex flex-col items-center justify-center space-y-4'>
          <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-primary'></div>
          <p className='text-lg'>Preparing your Windows download...</p>
          <p className='text-muted-foreground'>Fetching the latest version</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='container mx-auto px-4 py-20 text-center'>
        <div className='flex flex-col items-center justify-center space-y-4'>
          <h1 className='text-2xl font-bold text-destructive'>
            Download Error
          </h1>
          <p className='text-muted-foreground'>
            We couldn't fetch the latest releases. Please try again later.
          </p>
          <button
            onClick={() => navigate({ to: "/download" })}
            className='bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-2 rounded-md transition-colors'>
            Go to Downloads Page
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className='container mx-auto px-4 py-20 text-center'>
      <div className='flex flex-col items-center justify-center space-y-4'>
        <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-primary'></div>
        <p className='text-lg'>Redirecting to Windows download...</p>
        <p className='text-muted-foreground'>
          If the download doesn't start automatically,{" "}
          <button
            onClick={() => navigate({ to: "/download" })}
            className='text-primary hover:underline'>
            click here
          </button>{" "}
          to go to the downloads page.
        </p>
      </div>
    </div>
  );
}
