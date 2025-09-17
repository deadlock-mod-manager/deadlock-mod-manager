import { createFileRoute } from '@tanstack/react-router';
import { DownloadsContainer } from '@/components/downloads/downloads-container';

const DownloadComponent = () => <DownloadsContainer />;

export const Route = createFileRoute('/download')({
  component: DownloadComponent,
});
