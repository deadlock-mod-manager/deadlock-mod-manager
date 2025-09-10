import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import { DOWNLOAD_URL } from '@/lib/constants';

export const Route = createFileRoute('/download')({
  component: DownloadComponent,
});

function DownloadComponent() {
  useEffect(() => {
    window.location.href = DOWNLOAD_URL;
  }, []);

  return (
    <div className="container mx-auto max-w-3xl py-12 text-center">
      <h1 className="mb-4 font-bold text-2xl">Redirecting to download...</h1>
      <p className="text-muted-foreground">
        If you're not redirected automatically,{' '}
        <a className="text-primary hover:underline" href={DOWNLOAD_URL}>
          click here
        </a>
        .
      </p>
    </div>
  );
}
