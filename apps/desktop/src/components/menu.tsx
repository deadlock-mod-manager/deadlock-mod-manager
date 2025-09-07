import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { WindowTitlebar } from 'tauri-controls';
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
} from '@/components/ui/menubar';
import { AboutDialog } from './about-dialog';
import Logo from './logo';
import { Dialog, DialogTrigger } from './ui/dialog';

export function Menu() {
  const { t } = useTranslation();
  const appWindow = getCurrentWindow();

  const closeWindow = useCallback(async () => {
    appWindow.close();
  }, [appWindow]);

  return (
    <WindowTitlebar className="z-20 border-b bg-background">
      <Menubar className="inline-flex items-center rounded-none border-b border-none">
        <MenubarMenu>
          <MenubarTrigger>
            <div className="inline-flex h-fit w-fit items-center gap-2">
              <Logo className="h-6 w-6" />
              <span className="font-primary text-md">Deadlock Mod Manager</span>
            </div>
          </MenubarTrigger>
          <Dialog modal={false}>
            <MenubarContent>
              <DialogTrigger asChild>
                <MenubarItem>{t('menu.about')}</MenubarItem>
              </DialogTrigger>
              <MenubarSeparator />
              <MenubarShortcut />
              <MenubarItem onClick={closeWindow}>
                {t('menu.quit')}<MenubarShortcut>⌘Q</MenubarShortcut>
              </MenubarItem>
            </MenubarContent>
            <AboutDialog />
          </Dialog>
        </MenubarMenu>

        <MenubarSeparator />

        <MenubarMenu>
          <Dialog modal={false}>
            <DialogTrigger asChild>
              <MenubarTrigger className="relative text-sm">
                {t('menu.about')}
              </MenubarTrigger>
            </DialogTrigger>
            <AboutDialog />
          </Dialog>
        </MenubarMenu>
      </Menubar>
    </WindowTitlebar>
  );
}
