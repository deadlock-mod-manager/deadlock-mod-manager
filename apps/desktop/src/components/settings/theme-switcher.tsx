import { Button } from "@deadlock-mods/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import { Monitor, Moon, Sun } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/components/providers/theme";

export function ThemeSwitcher() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();

  const getThemeIcon = () => {
    switch (theme) {
      case "light":
        return <Sun className='h-4 w-4' />;
      case "dark":
        return <Moon className='h-4 w-4' />;
      case "system":
        return <Monitor className='h-4 w-4' />;
      default:
        return <Moon className='h-4 w-4' />;
    }
  };

  const getThemeLabel = () => {
    switch (theme) {
      case "light":
        return t("theme.light");
      case "dark":
        return t("theme.dark");
      case "system":
        return t("theme.system");
      default:
        return t("theme.dark");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className='w-32 justify-start gap-2'
          size='sm'
          variant='outline'>
          {getThemeIcon()}
          <span className='hidden sm:inline'>{getThemeLabel()}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <Sun className='mr-2 h-4 w-4' />
          <span>Light</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <Moon className='mr-2 h-4 w-4' />
          <span>Dark</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          <Monitor className='mr-2 h-4 w-4' />
          <span>System</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default ThemeSwitcher;
