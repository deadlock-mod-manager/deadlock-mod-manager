import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@deadlock-mods/ui/components/avatar";
import { Badge } from "@deadlock-mods/ui/components/badge";
import { useSidebar } from "@deadlock-mods/ui/components/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { Trans, useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { useThemeOverride } from "@/components/providers/theme-overrides";
import useAbout from "@/hooks/use-about";
import { useActiveTheme } from "@/hooks/use-active-theme";
import { useContributors } from "@/hooks/use-contributors";
import {
  getDisplaySemver,
  isNightlyBuildVersion,
} from "@/lib/app-version-display";
import { CORE_TEAM, githubAvatarUrl } from "@/lib/contributors";
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
  const { t, i18n } = useTranslation();
  const { version } = useAbout();
  const { state } = useSidebar();
  const collapsed = collapsedProp ?? state === "collapsed";
  const activeTheme = useActiveTheme();
  const TopbarLogo = useThemeOverride("topbarLogo");
  const navigate = useNavigate();
  const { data: contributors } = useContributors();
  const coreNames = new Intl.ListFormat(i18n.language, {
    type: "conjunction",
  }).format(
    CORE_TEAM.filter((member) => member.role === "core").map(
      (member) => member.name,
    ),
  );

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
          <Tooltip>
            <TooltipTrigger asChild>
              <span className='text-muted-foreground text-xs leading-none'>
                <Trans
                  components={{
                    author: (
                      <button
                        className='cursor-pointer transition-colors hover:text-foreground hover:underline'
                        onClick={() => navigate("/contributors")}
                        type='button'
                      />
                    ),
                  }}
                  i18nKey='branding.byAuthor'
                  values={{ author: "Stormix" }}
                />
              </span>
            </TooltipTrigger>
            <TooltipContent className='max-w-64 p-3' side='bottom'>
              <div className='flex flex-col gap-2'>
                <div className='flex -space-x-2'>
                  {CORE_TEAM.map((member) => (
                    <Avatar
                      className='size-7 ring-2 ring-primary'
                      key={member.login}>
                      <AvatarImage
                        alt={member.name}
                        src={githubAvatarUrl(member.login, 56)}
                      />
                      <AvatarFallback className='text-[10px]'>
                        {member.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                </div>
                <span className='font-semibold text-xs'>
                  {t("branding.teamTitle")}
                </span>
                <span className='text-xs opacity-80'>
                  {contributors
                    ? t("branding.teamDescriptionWithCount", {
                        core: coreNames,
                        count: contributors.length,
                      })
                    : t("branding.teamDescription", { core: coreNames })}
                </span>
              </div>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
};

export default BrandingHeader;
