import Logo from '../logo';
import { PlatformDownloadButton } from './platform-download-button';

export const DownloadsHero = () => {
  return (
    <div className="bg-gradient-to-b from-background via-background to-muted/30 py-24">
      <div className="container mx-auto flex flex-col items-center space-y-8 text-center">
        <Logo className="h-16 w-16" />

        <h1 className="mb-8 font-bold text-4xl">
          Download Deadlock Mod Manager
        </h1>

        <PlatformDownloadButton
          className="mb-4 min-w-56"
          showVersionInfo={true}
        />
      </div>
    </div>
  );
};
