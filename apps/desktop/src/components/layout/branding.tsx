import { Badge } from "@deadlock-mods/ui/components/badge";
import { useSidebar } from "@deadlock-mods/ui/components/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Trans, useTranslation } from "react-i18next";
import { useThemeOverride } from "@/components/providers/theme-overrides";
import useAbout from "@/hooks/use-about";
import { useActiveTheme } from "@/hooks/use-active-theme";
import {
  getDisplaySemver,
  isNightlyBuildVersion,
} from "@/lib/app-version-display";
import { getPluginAssetUrl } from "@/lib/plugins";
import { cn } from "@/lib/utils";
import Logo from "./logo";

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
  lovelock: getPluginAssetUrl("themes", "public/pre-defined/lovelock/icon.png"),
  remlock: getPluginAssetUrl("themes", "public/pre-defined/remlock/icon.png"),
} as const;

const AUTHOR_GITHUB_URL = "https://github.com/Stormix";

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
  const activeTheme = useActiveTheme();
  const TopbarLogo = useThemeOverride("topbarLogo");

  let themedIconSrc: string | undefined;
  if (isPredefinedTheme(activeTheme)) {
    themedIconSrc = predefinedThemeIcons[activeTheme];
  }

  const iconSize = collapsed ? "size-7" : "size-9";
  const iconTransition =
    "transition-[width,height] duration-300 ease-dmm-smooth";

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
        "flex items-center transition-[padding,gap] duration-300 ease-dmm-smooth",
        collapsed ? "justify-center gap-0 px-0 py-0" : "gap-2.5 pl-1.5 py-3",
        className,
      )}
      data-sidebar-header='true'>
      <div className='flex shrink-0 items-center justify-center'>
        {renderIcon()}
      </div>
      <div
        className={cn(
          "flex min-w-0 flex-col gap-1 overflow-hidden transition-[opacity,max-width,transform] duration-200 ease-dmm-smooth",
          collapsed
            ? "pointer-events-none max-w-0 -translate-x-1 opacity-0"
            : "max-w-[12rem] translate-x-0 opacity-100 delay-100",
        )}>
        <span className='font-primary text-xl leading-none tracking-tight'>
          Deadlock Mod Manager
        </span>
        <div className='flex flex-wrap items-baseline gap-x-1'>
          {version &&
            (isNightlyBuildVersion(version) ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className='inline-flex cursor-default items-center gap-1.5'>
                    <span className='text-muted-foreground text-xs leading-none tabular-nums'>
                      v{getDisplaySemver(version)}
                    </span>
                    <Badge
                      className='h-4 px-1.5 py-0 font-medium text-[10px]'
                      variant='outline'>
                      {t("branding.nightlyBuild")}
                    </Badge>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <span className='font-mono text-xs'>
                    {t("branding.fullBuildVersion", { version })}
                  </span>
                </TooltipContent>
              </Tooltip>
            ) : (
              <span className='text-muted-foreground text-xs leading-none tabular-nums'>
                v{version}
              </span>
            ))}
          <span className='text-muted-foreground text-xs leading-none'>
            <Trans
              components={{
                author: (
                  <button
                    className='cursor-pointer transition-colors hover:text-foreground hover:underline'
                    onClick={() => openUrl(AUTHOR_GITHUB_URL)}
                    type='button'
                  />
                ),
              }}
              i18nKey='branding.byAuthor'
              values={{ author: "Stormix" }}
            />
          </span>
        </div>
      </div>
    </div>
  );
};

export default BrandingHeader;
