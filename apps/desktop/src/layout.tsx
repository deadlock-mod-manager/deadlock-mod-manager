import { AppSidebar } from './components/app-sidebar';
import { Menu } from './components/menu';
import { Toolbar } from './components/toolbar';
import { Dialog } from './components/ui/dialog';
import { SidebarProvider } from './components/ui/sidebar';
import { Toaster } from './components/ui/sonner';
import { WhatsNewDialog } from './components/whats-new-dialog';
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
            <div className={cn('flex p-8')}>{children}</div>
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
