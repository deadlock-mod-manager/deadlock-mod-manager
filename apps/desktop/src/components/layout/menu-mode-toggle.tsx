import { Laptop, Moon, Sun } from "@phosphor-icons/react";
import { useTheme } from "@/components/providers/theme";
import {
  MenubarContent,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarTrigger,
} from "@/components/ui/menubar";

export function MenuModeToggle() {
  const { setTheme, theme } = useTheme();

  return (
    <MenubarMenu>
      <MenubarTrigger>Theme</MenubarTrigger>
      <MenubarContent forceMount>
        <MenubarRadioGroup value={theme}>
          <MenubarRadioItem onClick={() => setTheme("light")} value='light'>
            <Sun className='mr-2 h-4 w-4' />
            <span>Light</span>
          </MenubarRadioItem>
          <MenubarRadioItem onClick={() => setTheme("dark")} value='dark'>
            <Moon className='mr-2 h-4 w-4' />
            <span>Dark</span>
          </MenubarRadioItem>
          <MenubarRadioItem onClick={() => setTheme("system")} value='system'>
            <Laptop className='mr-2 h-4 w-4' />
            <span>System</span>
          </MenubarRadioItem>
        </MenubarRadioGroup>
      </MenubarContent>
    </MenubarMenu>
  );
}
