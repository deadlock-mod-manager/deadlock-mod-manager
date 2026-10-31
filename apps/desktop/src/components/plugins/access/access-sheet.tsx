import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@deadlock-mods/ui/components/sheet";
import {
  CheckCircleIcon,
  CheckIcon,
  InfoIcon,
  LockKeyIcon,
  ProhibitIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import {
  describeActivity,
  REQUEST_KINDS,
} from "@/components/plugins/access/activity-copy";
import { AlwaysBlocked } from "@/components/plugins/access/always-blocked";
import {
  grantProgress,
  PermissionGrantCards,
} from "@/components/plugins/access/grant-cards";
import { usePluginActions } from "@/components/plugins/access/use-plugin-actions";
import { usePluginProfiles } from "@/components/plugins/access/use-plugin-profiles";
import { useRelativeTime } from "@/components/plugins/plugin-format";
import { PluginTile } from "@/components/plugins/plugin-identity";
import { TONE_COLOR } from "@/components/plugins/plugin-status";
import { useExternalPluginActivity } from "@/hooks/use-external-plugin-activity";
import { cn } from "@/lib/utils";
import type { ExternalPluginSummary } from "@/types/generated/ExternalPluginSummary";

const RECENT_REQUESTS = 3;

const RecentRequests = ({
  plugin,
  onSeeAll,
}: {
  plugin: ExternalPluginSummary;
  onSeeAll: () => void;
}) => {
  const { t } = useTranslation();
  const lookup = usePluginProfiles();
  const relativeTime = useRelativeTime();
  const { data: activity = [] } = useExternalPluginActivity(plugin.id);
  const requests = activity
    .filter((entry) => REQUEST_KINDS.includes(entry.kind))
    .slice(0, RECENT_REQUESTS);

  return (
    <div className='flex w-full flex-col gap-[2px]'>
      <div className='flex w-full items-center pb-[6px]'>
        <span className='font-semibold text-[#A3A3A3] text-[11px] uppercase leading-[normal]'>
          {t("plugins.access.sheet.recentRequests")}
        </span>
        <span className='h-px flex-1' />
        <button
          className='text-[12px] text-primary leading-[normal] hover:underline'
          onClick={onSeeAll}
          type='button'>
          {t("plugins.access.sheet.seeAll")}
        </button>
      </div>
      {requests.length === 0 && (
        <p className='px-[10px] py-[8px] text-[#A3A3A3] text-[12px] leading-[normal]'>
          {t("plugins.access.sheet.noRequests")}
        </p>
      )}
      {requests.map((request) => {
        const blocked = request.kind === "blocked";
        const StateIcon = blocked ? ProhibitIcon : CheckCircleIcon;
        return (
          <div
            className={cn(
              "flex w-full items-center gap-[10px] rounded-[8px] px-[10px] py-[8px]",
              blocked &&
                "bg-[#F8717112] outline outline-1 -outline-offset-1 outline-[#F8717133]",
            )}
            key={`${request.at}-${request.kind}`}>
            <StateIcon
              className='shrink-0'
              color={blocked ? TONE_COLOR.danger : TONE_COLOR.ok}
              size={15}
            />
            <div className='flex min-w-0 flex-1 flex-col gap-[2px]'>
              <span className='truncate text-[13px] text-foreground leading-[normal]'>
                {describeActivity(t, request, lookup, "request")}
              </span>
              <span className='truncate font-mono text-[#A3A3A3] text-[11px] leading-[normal]'>
                {request.method ?? request.permission}
              </span>
            </div>
            <span className='shrink-0 text-[#A3A3A3] text-[11px] leading-[normal]'>
              {relativeTime(request.at)}
            </span>
          </div>
        );
      })}
    </div>
  );
};

type PluginAccessSheetProps = {
  plugin: ExternalPluginSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** What a plugin may use, with the controls to change or take it back. */
export const PluginAccessSheet = ({
  plugin,
  open,
  onOpenChange,
}: PluginAccessSheetProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { revoke, confirmRevoke } = usePluginActions(plugin);
  const { done, total } = grantProgress(plugin);
  const close = () => onOpenChange(false);

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className='flex w-[480px] flex-col gap-0 border-0 bg-card p-0 shadow-[inset_1px_0_0_0_hsl(var(--border))] sm:max-w-[480px]'
        hideClose
        overlayClassName='bg-[#0B0A09CC]'
        side='right'>
        <div className='flex w-full shrink-0 gap-[14px] border-border border-b px-[24px] pt-[22px] pb-[17px]'>
          <PluginTile
            accent={plugin.accent}
            fillAlpha='26'
            glyphSize={20}
            icon={plugin.icon}
            outlineAlpha='33'
            radius={10}
            size={40}
          />
          <div className='flex min-w-0 flex-1 flex-col gap-[4px]'>
            <SheetTitle className='font-semibold text-[18px] text-foreground leading-[normal]'>
              {t("plugins.access.sheet.title")}
            </SheetTitle>
            <SheetDescription className='w-full text-[#A3A3A3] text-[13px] leading-[18px]'>
              {t("plugins.access.sheet.description", { name: plugin.name })}
            </SheetDescription>
          </div>
          <SheetClose
            aria-label={t("plugins.access.sheet.close")}
            className='flex size-[32px] shrink-0 items-center justify-center rounded-[8px] hover:bg-[#FFFFFF0A]'>
            <XIcon color='#A3A3A3' size={16} />
          </SheetClose>
        </div>

        <div className='flex min-h-0 w-full flex-1 flex-col gap-[12px] overflow-y-auto px-[24px] py-[20px] [&>*]:shrink-0'>
          {total > 0 && (
            <>
              <div className='flex w-full items-center'>
                <span className='font-semibold text-[#A3A3A3] text-[11px] uppercase leading-[normal]'>
                  {t("plugins.access.sheet.required")}
                </span>
                <span className='h-px flex-1' />
                <span
                  className='text-[12px] leading-[normal]'
                  style={{
                    color: done === total ? TONE_COLOR.ok : TONE_COLOR.warn,
                  }}>
                  {t("plugins.access.sheet.progress", { done, total })}
                </span>
              </div>
              <PermissionGrantCards onNavigate={close} plugin={plugin} />
              <div className='h-[4px] w-full shrink-0' />
            </>
          )}
          <AlwaysBlocked plugin={plugin} />
          <div className='h-[6px] w-full shrink-0' />
          <RecentRequests
            onSeeAll={() => {
              close();
              navigate(
                `/plugins/manage?tab=installed&plugin=${encodeURIComponent(plugin.id)}&panel=activity`,
              );
            }}
            plugin={plugin}
          />
          <div className='w-full flex-1' />
          <div className='flex w-full gap-[8px]'>
            <InfoIcon className='shrink-0' color='#A3A3A3' size={14} />
            <span className='flex-1 text-[#A3A3A3] text-[12px] leading-[normal]'>
              {t("plugins.access.sheet.applyNote")}
            </span>
          </div>
        </div>

        <div className='flex w-full shrink-0 items-center gap-[10px] border-border border-t px-[24px] pt-[13px] pb-[14px]'>
          <button
            className='flex items-center gap-[6px] rounded-[8px] px-[10px] py-[6px] text-[#F87171] text-[13px] leading-[normal] hover:bg-[#F8717112] disabled:pointer-events-none disabled:opacity-50'
            disabled={!plugin.grant || revoke.isPending}
            onClick={() => void confirmRevoke()}
            type='button'>
            <LockKeyIcon color='currentColor' size={16} />
            {t("plugins.access.actions.revokeAll")}
          </button>
          <span className='h-px flex-1' />
          <button
            className='flex items-center gap-[8px] rounded-[8px] bg-primary px-[14px] py-[8px] font-semibold text-[14px] text-primary-foreground leading-[normal] hover:bg-primary/90'
            onClick={close}
            type='button'>
            <CheckIcon color='currentColor' size={16} />
            {t("plugins.access.sheet.done")}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
