import { Dialog } from "@deadlock-mods/ui/components/dialog";
import {
  SidebarInset,
  SidebarProvider,
} from "@deadlock-mods/ui/components/sidebar";
import { Toaster } from "@deadlock-mods/ui/components/sonner";
import { AppSidebar } from "./components/layout/app-sidebar";
import { BottomBar } from "./components/layout/bottom-bar";
import { OccultGeometry } from "./components/layout/occult-geometry";
import { Titlebar } from "./components/layout/titlebar";
import { WhatsNewDialog } from "./components/layout/whats-new-dialog";
import { ScrollBackButtonProvider } from "./contexts/scroll-back-button-context";
import { usePageTracking } from "./hooks/use-page-tracking";
import { useWhatsNew } from "./hooks/use-whats-new";

export const Layout = ({ children }: { children: React.ReactNode }) => {
  const { showWhatsNew, markVersionAsSeen } = useWhatsNew();
  usePageTracking();

  return (
    <>
      <OccultGeometry />
      <div className='flex h-screen w-screen flex-col overflow-hidden'>
        <ScrollBackButtonProvider>
          <SidebarProvider className='flex min-h-0 flex-1 flex-col overflow-hidden'>
            <Titlebar />
            <div className='relative flex min-h-0 flex-1 overflow-hidden'>
              <AppSidebar />
              <SidebarInset className='flex min-h-0 flex-1 flex-col'>
                <div className='flex min-h-0 flex-1 flex-col overflow-hidden px-2 pt-4'>
                  {children}
                </div>
                <BottomBar />
              </SidebarInset>
            </div>
          </SidebarProvider>
        </ScrollBackButtonProvider>
      </div>
      <Toaster />

      <Dialog
        onOpenChange={(open) => !open && markVersionAsSeen()}
        open={showWhatsNew}>
        <WhatsNewDialog onClose={markVersionAsSeen} />
      </Dialog>
    </>
  );
};
