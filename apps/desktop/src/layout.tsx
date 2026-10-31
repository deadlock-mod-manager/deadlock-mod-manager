import { Dialog } from "@deadlock-mods/ui/components/dialog";
import {
  SidebarInset,
  SidebarProvider,
} from "@deadlock-mods/ui/components/sidebar";
import { Toaster } from "@deadlock-mods/ui/components/sonner";
import { BisectRenderer } from "./components/bisect/bisect-renderer";
import { FeatureHintsRenderer } from "./components/feature-hints/feature-hints-renderer";
import { AppSidebar } from "./components/layout/app-sidebar";
import { BottomBar } from "./components/layout/bottom-bar";
import { CatalogSyncProgress } from "./components/layout/catalog-sync-progress";
import { GameConfigBanner } from "./components/layout/game-config-banner";
import { GlobalFileDrop } from "./components/layout/global-file-drop";
import { LaunchOverlay } from "./components/layout/launch-overlay";
import { OccultGeometry } from "./components/layout/occult-geometry";
import { Titlebar } from "./components/layout/titlebar";
import { WhatsNewDialog } from "./components/layout/whats-new-dialog";
import { GlobalAudioPlayer } from "./components/global-audio-player";
import { ScrollBackButtonProvider } from "./contexts/scroll-back-button-context";
import { useExternalPluginNotifications } from "./hooks/use-external-plugins";
import { usePageTracking } from "./hooks/use-page-tracking";
import { useWhatsNew } from "./hooks/use-whats-new";

export const Layout = ({ children }: { children: React.ReactNode }) => {
  const { showWhatsNew, markVersionAsSeen } = useWhatsNew();
  usePageTracking();
  useExternalPluginNotifications();

  return (
    <>
      <OccultGeometry />
      <div className='flex h-screen w-screen flex-col overflow-hidden'>
        <ScrollBackButtonProvider>
          <SidebarProvider className='flex min-h-0 flex-1 flex-col overflow-hidden'>
            <Titlebar />
            <GameConfigBanner />
            <BisectRenderer />
            <div className='relative flex min-h-0 flex-1 overflow-hidden'>
              <AppSidebar />
              <SidebarInset className='flex min-h-0 flex-1 flex-col'>
                <div className='relative z-[2] flex min-h-0 flex-1 flex-col overflow-hidden'>
                  <CatalogSyncProgress />
                  {children}
                </div>
              </SidebarInset>
              <LaunchOverlay />
            </div>
            <BottomBar />
          </SidebarProvider>
        </ScrollBackButtonProvider>
      </div>
      <Toaster
        offset={{ top: 52, right: 16 }}
        position='top-right'
        visibleToasts={3}
      />
      <GlobalAudioPlayer />
      <FeatureHintsRenderer />
      <GlobalFileDrop />

      <Dialog
        onOpenChange={(open) => !open && markVersionAsSeen()}
        open={showWhatsNew}>
        <WhatsNewDialog onClose={markVersionAsSeen} />
      </Dialog>
    </>
  );
};
