import { Dialog } from "@deadlock-mods/ui/components/dialog";
import {
  SidebarInset,
  SidebarProvider,
} from "@deadlock-mods/ui/components/sidebar";
import { Toaster } from "@deadlock-mods/ui/components/sonner";
import { AppSidebar } from "./components/layout/app-sidebar";
import { BottomBar } from "./components/layout/bottom-bar";
import { Menu } from "./components/layout/menu";
import { Toolbar } from "./components/layout/toolbar";
import { WhatsNewDialog } from "./components/layout/whats-new-dialog";
import { ScrollBackButtonProvider } from "./contexts/scroll-back-button-context";
import { usePageTracking } from "./hooks/use-page-tracking";
import { useWhatsNew } from "./hooks/use-whats-new";
import { cn } from "./lib/utils";

export const Layout = ({ children }: { children: React.ReactNode }) => {
  const { showWhatsNew, markVersionAsSeen } = useWhatsNew();
  usePageTracking();

  return (
    <>
      <main className='h-screen overflow-hidden'>
        <Menu />
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <ScrollBackButtonProvider>
              <div className={cn("flex h-full w-full flex-col")}>
                <Toolbar />
                <div className={cn("flex flex-1 pr-2 pl-2 pt-4")}>
                  {children}
                </div>
                <BottomBar />
              </div>
            </ScrollBackButtonProvider>
          </SidebarInset>
        </SidebarProvider>
      </main>
      <Toaster />

      <Dialog
        onOpenChange={(open) => !open && markVersionAsSeen()}
        open={showWhatsNew}>
        <WhatsNewDialog onClose={markVersionAsSeen} />
      </Dialog>
    </>
  );
};
