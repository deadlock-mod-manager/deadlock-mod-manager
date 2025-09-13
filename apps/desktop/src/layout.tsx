import { AppSidebar } from './components/layout/app-sidebar';
import { BottomBar } from './components/layout/bottom-bar';
import Menu from './components/layout/menu';
import { Toolbar } from './components/layout/toolbar';
import { WhatsNewDialog } from './components/layout/whats-new-dialog';
import { Dialog } from './components/ui/dialog';
import { SidebarProvider } from './components/ui/sidebar';
import { Toaster } from './components/ui/sonner';
import useWhatsNew from './hooks/use-whats-new';
import { cn } from './lib/utils';

export const Layout = ({ children }: { children: React.ReactNode }) => {
  const { showWhatsNew, markVersionAsSeen } = useWhatsNew();

  return (
    <>
      <main className="h-screen overflow-hidden">
        <Menu />
        <SidebarProvider>
          <AppSidebar />
          <div className={cn('flex h-full w-full flex-col')}>
            <Toolbar />
            <div className={cn('flex flex-1 px-8 pt-4')}>{children}</div>
            <BottomBar />
          </div>
        </SidebarProvider>
      </main>
      <Toaster />

      <Dialog
        onOpenChange={(open) => !open && markVersionAsSeen()}
        open={showWhatsNew}
      >
        <WhatsNewDialog onClose={markVersionAsSeen} />
      </Dialog>
    </>
  );
};
