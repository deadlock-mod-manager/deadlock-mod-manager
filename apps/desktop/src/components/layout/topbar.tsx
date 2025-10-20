import { Badge } from "@deadlock-mods/ui/components/badge";
import useAbout from "@/hooks/use-about";
import { usePersistedStore } from "@/lib/store";
import UserMenu from "../user-menu";
import Logo from "./logo";

type ThemesPluginSettings =
  | {
      activeTheme?: string;
      customTheme?: { iconData?: string };
      userThemes?: Array<{
        id: string;
        iconData?: string;
      }>;
    }
  | undefined;

export const Topbar = () => {
  const { version } = useAbout();
  const themesEnabled = usePersistedStore(
    (s) => s.enabledPlugins.themes ?? false,
  );
  const themesSettings = usePersistedStore(
    (s) => s.pluginSettings.themes,
  ) as ThemesPluginSettings;
  const activeTheme = themesEnabled ? themesSettings?.activeTheme : undefined;
  const themedIconSrc =
    activeTheme === "nightshift"
      ? "/src/plugins/themes/public/pre-defiend/nightshift/icon.png"
      : activeTheme === "bloodmoon"
        ? "/src/plugins/themes/public/pre-defiend/bloodmoon/icon.png"
        : activeTheme === "custom"
          ? themesSettings?.customTheme?.iconData || undefined
          : themesSettings?.userThemes?.find((t) => t.id === activeTheme)
              ?.iconData || undefined;

  return (
    <div className='border-t border-border h-16 justify-between items-center flex px-4 bg-background'>
      <div className='flex items-center gap-2'>
        {themedIconSrc ? (
          <img
            alt='Deadlock'
            className='h-11 w-11 object-contain'
            src={themedIconSrc}
          />
        ) : (
          <Logo className='size-11' />
        )}
        <span className='font-primary text-2xl'>Deadlock Mod Manager</span>
        {version && (
          <span className='text-muted-foreground text-xs'>v{version}</span>
        )}
        <Badge className='font-medium text-xs' variant='outline'>
          Early Access
        </Badge>
      </div>
      <div className='flex items-center gap-2'>
        <UserMenu />
      </div>
    </div>
  );
};
