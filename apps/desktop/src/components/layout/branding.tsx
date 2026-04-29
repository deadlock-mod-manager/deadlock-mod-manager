import { Badge } from "@deadlock-mods/ui/components/badge";
import { useSidebar } from "@deadlock-mods/ui/components/sidebar";
import { useTranslation } from "react-i18next";
import { useThemeOverride } from "@/components/providers/theme-overrides";
import useAbout from "@/hooks/use-about";
import { getPluginAssetUrl } from "@/lib/plugins";
import { usePersistedStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import Logo from "./logo";

type ThemesPluginSettings =
  | {
      activeTheme?: string;
      userThemes?: Array<{
        id: string;
      }>;
    }
  | undefined;

const predefinedThemeIcons = {
  nightshift: getPluginAssetUrl(
    "themes",
    "public/pre-defined/nightshift/icon.png",
  ),
  bloodmoon: getPluginAssetUrl(
    "themes",
    "public/pre-defined/bloodmoon/icon.png",
  ),
  tea: getPluginAssetUrl("themes", "public/pre-defined/tea/logo.png"),
} as const;

type PredefinedThemeId = keyof typeof predefinedThemeIcons;

const isPredefinedTheme = (
  theme: string | undefined,
): theme is PredefinedThemeId => {
  return theme !== undefined && theme in predefinedThemeIcons;
};

export type BrandingHeaderProps = {
  className?: string;
  collapsed?: boolean;
};

export const BrandingHeader = ({
  className,
  collapsed: collapsedProp,
}: BrandingHeaderProps) => {
  const { t } = useTranslation();
  const { version } = useAbout();
  const { state } = useSidebar();
  const collapsed = collapsedProp ?? state === "collapsed";
  const themesEnabled = usePersistedStore(
    (s) => s.enabledPlugins.themes ?? false,
  );
  const themesSettings = usePersistedStore(
    (s) => s.pluginSettings.themes,
  ) as ThemesPluginSettings;
  const activeTheme = themesEnabled ? themesSettings?.activeTheme : undefined;
  const TopbarLogo = useThemeOverride("topbarLogo");

  let themedIconSrc: string | undefined;
  if (isPredefinedTheme(activeTheme)) {
    themedIconSrc = predefinedThemeIcons[activeTheme];
  }

  const iconSize = collapsed ? "size-7" : "size-9";
  const iconTransition =
    "transition-[width,height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]";

  const renderIcon = () => {
    if (TopbarLogo) {
      return <TopbarLogo />;
    }
    if (themedIconSrc) {
      return (
        <img
          alt={t("accessibility.deadlockLogoAlt")}
          className={cn("object-contain", iconSize, iconTransition)}
          src={themedIconSrc}
        />
      );
    }
    return <Logo className={cn(iconSize, iconTransition)} />;
  };

  return (
    <div
      className={cn(
        "flex items-center transition-[padding,gap] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        collapsed ? "justify-center gap-0 px-0 py-2" : "gap-2.5 pl-1.5 py-3",
        className,
      )}
      data-sidebar-header='true'>
      <div className='flex shrink-0 items-center justify-center'>
        {renderIcon()}
      </div>
      <div
        className={cn(
          "flex min-w-0 flex-col gap-1 overflow-hidden transition-[opacity,max-width,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
          collapsed
            ? "pointer-events-none max-w-0 -translate-x-1 opacity-0"
            : "max-w-[12rem] translate-x-0 opacity-100 delay-100",
        )}>
        <span className='font-primary text-xl leading-none tracking-tight'>
          Deadlock Mod Manager
        </span>
        <div className='flex items-center gap-1.5'>
          {version && (
            <span className='text-muted-foreground text-xs leading-none tabular-nums'>
              v{version}
            </span>
          )}
          <Badge
            className='h-4 px-1.5 py-0 font-medium text-[10px]'
            variant='outline'>
            Early Access
          </Badge>
        </div>
      </div>
    </div>
  );
};

export default BrandingHeader;
