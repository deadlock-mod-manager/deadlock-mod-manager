import { useCallback } from 'react';
import { WindowTitlebar } from 'tauri-controls';

import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger
} from '@/components/ui/menubar';

import { getCurrentWindow } from '@tauri-apps/api/window';
import { AboutDialog } from './about-dialog';
import Logo from './logo';
import { Dialog, DialogTrigger } from './ui/dialog';

export function Menu() {
  const appWindow = getCurrentWindow();

  const closeWindow = useCallback(async () => {
    appWindow.close();
  }, [appWindow]);

  return (
    <WindowTitlebar className="border-b bg-background z-20">
      <Menubar className="rounded-none border-b border-none inline-flex items-center">
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
                <MenubarItem>About</MenubarItem>
              </DialogTrigger>
              <MenubarSeparator />
              <MenubarShortcut />
              <MenubarItem onClick={closeWindow}>
                Quit<MenubarShortcut>⌘Q</MenubarShortcut>
              </MenubarItem>
            </MenubarContent>
            <AboutDialog />
          </Dialog>
        </MenubarMenu>

        <MenubarSeparator />

        <MenubarMenu>
          <Dialog modal={false}>
            <DialogTrigger asChild>
              <MenubarTrigger className="relative text-sm">About</MenubarTrigger>
            </DialogTrigger>
            <AboutDialog />
          </Dialog>
        </MenubarMenu>
      </Menubar>
    </WindowTitlebar>
  );
}
