import {
  CheckCircleIcon,
  ClockIcon,
  DownloadSimpleIcon,
} from "@phosphor-icons/react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { InstallButton } from "@/components/plugins/manage/install-button";
import { INSET_OUTLINE } from "@/components/plugins/manage/plugin-styles";
import { formatRelativeTime } from "@/components/plugins/plugin-format";
import { PluginTile } from "@/components/plugins/plugin-identity";
import { describeAccess } from "@/components/plugins/plugin-permissions";
import { TONE_COLOR } from "@/components/plugins/plugin-status";
import { type CatalogEntry } from "@/lib/plugins/catalog";
import { cn } from "@/lib/utils";

const formatInstalls = (t: TFunction, installs: number) =>
  installs < 1000
    ? String(installs)
    : t("plugins.discover.thousands", {
        value: (installs / 1000).toFixed(1).replace(/\.0$/, ""),
      });

export const CatalogCard = ({
  entry,
  installed,
  now,
}: {
  entry: CatalogEntry;
  installed: boolean;
  now: number;
}) => {
  const { t, i18n } = useTranslation();
  return (
    <article
      className={cn(
        "flex min-w-0 flex-1 flex-col gap-[12px] rounded-[12px] bg-card p-[16px] outline-foreground/[0.06]",
        INSET_OUTLINE,
      )}>
      <div className='flex w-full items-center gap-[12px]'>
        <PluginTile
          accent={entry.accent}
          fillAlpha={10}
          glyphSize={21}
          icon={entry.icon}
          radius={10}
          size={42}
        />
        <div className='flex min-w-0 flex-1 flex-col gap-[3px]'>
          <span className='truncate font-semibold text-lg text-foreground leading-6'>
            {entry.name}
          </span>
          <div className='flex items-center gap-[5px]'>
            <span className='truncate text-muted-foreground text-[12px] leading-[normal]'>
              {t("plugins.discover.by", { author: entry.author })}
            </span>
            {entry.verified ? (
              <CheckCircleIcon
                aria-label={t("plugins.discover.verified")}
                className='shrink-0 text-primary'
                role='img'
                size={13}
              />
            ) : (
              <span className='rounded-[5px] bg-[#FBBF241A] px-[6px] py-[1px] font-semibold text-[#FBBF24] text-[10px] leading-[normal]'>
                {t("plugins.discover.unverified")}
              </span>
            )}
          </div>
        </div>
      </div>
      <p className='w-full text-base text-muted-foreground leading-6'>
        {t(`plugins.catalog.${entry.copyKey}.description`)}
      </p>
      <p className='w-full border-border border-t pt-3 text-sm text-muted-foreground leading-6'>
        {describeAccess(t, i18n.language, entry.permissions)}
      </p>
      <div className='mt-auto flex w-full items-center gap-[12px] pt-[4px]'>
        {entry.installs === undefined ? null : (
          <span className='flex items-center gap-[5px]'>
            <DownloadSimpleIcon className='text-muted-foreground' size={13} />
            <span className='font-mono text-muted-foreground text-[12px] leading-[normal]'>
              {formatInstalls(t, entry.installs)}
            </span>
          </span>
        )}
        <span className='flex items-center gap-[5px]'>
          <ClockIcon className='text-muted-foreground' size={13} />
          <span className='text-muted-foreground text-[12px] leading-[normal]'>
            {formatRelativeTime(t, entry.updatedAt, now)}
          </span>
        </span>
        <span className='h-px flex-1' />
        {installed ? (
          <span className='flex items-center gap-[5px] px-[4px] py-[6px]'>
            <CheckCircleIcon color={TONE_COLOR.ok} size={14} />
            <span className='font-semibold text-[#4ADE80] text-[13px] leading-[normal]'>
              {t("plugins.discover.installed")}
            </span>
          </span>
        ) : (
          <InstallButton entry={entry} />
        )}
      </div>
    </article>
  );
};
