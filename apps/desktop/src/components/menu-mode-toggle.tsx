import {
  MenubarContent,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarTrigger
} from '@/components/ui/menubar';
import { Laptop, Moon, Sun } from '@phosphor-icons/react';
import { useTheme } from './providers/theme';

export function MenuModeToggle() {
  const { setTheme, theme } = useTheme();

  return (
    <MenubarMenu>
      <MenubarTrigger>Theme</MenubarTrigger>
      <MenubarContent forceMount>
        <MenubarRadioGroup value={theme}>
          <MenubarRadioItem value="light" onClick={() => setTheme('light')}>
            <Sun className="mr-2 h-4 w-4" />
            <span>Light</span>
          </MenubarRadioItem>
          <MenubarRadioItem value="dark" onClick={() => setTheme('dark')}>
            <Moon className="mr-2 h-4 w-4" />
            <span>Dark</span>
          </MenubarRadioItem>
          <MenubarRadioItem value="system" onClick={() => setTheme('system')}>
            <Laptop className="mr-2 h-4 w-4" />
            <span>System</span>
          </MenubarRadioItem>
        </MenubarRadioGroup>
      </MenubarContent>
    </MenubarMenu>
  );
}
