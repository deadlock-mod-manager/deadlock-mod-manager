import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@deadlock-mods/ui/components/sheet";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  ArrowCircleUpIcon,
  ArrowRightIcon,
  EyeIcon,
  InfoIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { PluginTile } from "@/components/plugins/plugin-identity";
import {
  sortPermissions,
  usePermissionCopy,
} from "@/components/plugins/plugin-permissions";
import { TONE_COLOR } from "@/components/plugins/plugin-status";
import { getErrorMessage } from "@/lib/errors";
import {
  applyExternalPluginUpdate,
  discardExternalPluginUpdate,
  EXTERNAL_PLUGINS_QUERY_KEY,
} from "@/lib/external-plugins";
import logger from "@/lib/logger";
import type { ExternalPluginPendingUpdate } from "@/types/generated/ExternalPluginPendingUpdate";
import type { ExternalPluginPermission } from "@/types/generated/ExternalPluginPermission";
import type { ExternalPluginSummary } from "@/types/generated/ExternalPluginSummary";
import { PageButton } from "./page-button";

/** Requests the update adds or widens, and the ones it keeps as they are. */
const updateChanges = (
  plugin: ExternalPluginSummary,
  update: ExternalPluginPendingUpdate,
) => {
  const added = sortPermissions(update.newPermissions);
  const kept = sortPermissions(plugin.requiredPermissions).filter(
    (permission) => !added.some((entry) => entry.id === permission.id),
  );
  return { added, kept };
};

export const UpdateBanner = ({
  plugin,
  update,
  onReview,
}: {
  plugin: ExternalPluginSummary;
  update: ExternalPluginPendingUpdate;
  onReview: () => void;
}) => {
  const { t } = useTranslation();
  const { added } = updateChanges(plugin, update);
  return (
    <div className='flex shrink-0 items-center gap-3 border-[#6FA8F533] border-b bg-[#6FA8F514] px-6 pt-2.5 pb-[9px]'>
      <ArrowCircleUpIcon color={TONE_COLOR.info} size={16} />
      <p className='flex-1 text-[13px] text-foreground leading-[normal]'>
        {added.length > 0
          ? t("plugins.page.update.banner", {
              count: added.length,
              version: update.version,
            })
          : t("plugins.page.update.bannerNothingNew", {
              version: update.version,
            })}
      </p>
      <PageButton onClick={onReview} variant='outline'>
        <EyeIcon />
        {t("plugins.page.update.review")}
      </PageButton>
    </div>
  );
};

const ChangeRow = ({
  permission,
  isNew,
}: {
  permission: ExternalPluginPermission;
  isNew: boolean;
}) => {
  const { t } = useTranslation();
  const describe = usePermissionCopy();
  const copy = describe(permission);
  const PermissionIcon = copy.icon;
  return (
    <div
      className={
        isNew
          ? "flex w-full items-center gap-3 rounded-[10px] bg-[#60A5FA0F] px-[14px] py-3 ring-1 ring-[#60A5FA4D] ring-inset"
          : "flex w-full items-center gap-3 rounded-[10px] bg-card px-[14px] py-3 ring-1 ring-[#FFFFFF0F] ring-inset"
      }>
      <span
        className={
          isNew
            ? "flex size-7 shrink-0 items-center justify-center rounded-[7px] bg-[#60A5FA1F] text-[#60A5FA]"
            : "flex size-7 shrink-0 items-center justify-center rounded-[7px] bg-[#FFFFFF0A] text-muted-foreground"
        }>
        <PermissionIcon size={15} />
      </span>
      <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
        <span
          className={
            isNew
              ? "font-semibold text-[13px] text-foreground leading-[normal]"
              : "font-semibold text-[13px] text-muted-foreground leading-[normal]"
          }>
          {copy.title}
        </span>
        {isNew ? (
          <span className='text-[12px] text-muted-foreground leading-[17px]'>
            {copy.detail}
          </span>
        ) : null}
      </div>
      <span
        className={
          isNew
            ? "shrink-0 rounded-[6px] bg-[#60A5FA26] px-2 py-0.5 font-semibold text-[#60A5FA] text-[11px] leading-[normal]"
            : "shrink-0 rounded-[6px] bg-[#FFFFFF0A] px-2 py-0.5 font-semibold text-[11px] text-muted-foreground leading-[normal]"
        }>
        {t(isNew ? "plugins.page.update.new" : "plugins.page.update.unchanged")}
      </span>
    </div>
  );
};

type UpdateSheetProps = {
  plugin: ExternalPluginSummary;
  update: ExternalPluginPendingUpdate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const UpdateSheet = ({
  plugin,
  update,
  open,
  onOpenChange,
}: UpdateSheetProps) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { added, kept } = updateChanges(plugin, update);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: EXTERNAL_PLUGINS_QUERY_KEY });
  const reportFailure = (titleKey: string) => (error: Error) => {
    logger.errorOnly(error);
    toast.error(t(titleKey), { description: getErrorMessage(error) });
  };

  const apply = useMutation({
    mutationFn: () => applyExternalPluginUpdate(plugin.id, update.packageHash),
    meta: { skipGlobalErrorHandler: true },
    onSuccess: (updated) => {
      toast.success(
        t("plugins.page.update.applied", {
          name: updated.name,
          version: updated.version,
        }),
      );
      onOpenChange(false);
      void refresh();
    },
    onError: reportFailure("plugins.page.update.applyFailed"),
  });

  const discard = useMutation({
    mutationFn: () => discardExternalPluginUpdate(plugin.id),
    meta: { skipGlobalErrorHandler: true },
    onSuccess: () => {
      onOpenChange(false);
      void refresh();
    },
    onError: reportFailure("plugins.page.update.discardFailed"),
  });

  const busy = apply.isPending || discard.isPending;

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        aria-describedby={undefined}
        className='flex w-[480px] max-w-full flex-col gap-0 border-0 bg-card p-0 shadow-[inset_1px_0_0_0_hsl(var(--border))] sm:max-w-[480px]'
        hideClose
        overlayClassName='bg-[#0B0A09CC]'
        side='right'>
        <div className='flex shrink-0 gap-[14px] border-border border-b px-6 pt-[22px] pb-[17px]'>
          <PluginTile
            accent={plugin.accent}
            fillAlpha='26'
            glyphSize={20}
            icon={plugin.icon}
            outlineAlpha='33'
            radius={10}
            size={40}
          />
          <div className='flex min-w-0 flex-1 flex-col gap-1.5'>
            <SheetTitle className='font-semibold text-[18px] text-foreground leading-[normal]'>
              {t("plugins.page.update.title", { version: update.version })}
            </SheetTitle>
            <div className='flex items-center gap-2 text-[12px] text-muted-foreground leading-[normal]'>
              <span className='font-mono'>{plugin.version}</span>
              <ArrowRightIcon size={12} />
              <span className='font-mono text-[#60A5FA]'>{update.version}</span>
              {plugin.author ? (
                <span className='truncate'>
                  {t("plugins.page.hostBar.by", { author: plugin.author })}
                </span>
              ) : null}
            </div>
          </div>
          <button
            aria-label={t("plugins.page.update.close")}
            className='flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[8px] text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
            onClick={() => onOpenChange(false)}
            type='button'>
            <XIcon size={16} />
          </button>
        </div>
        <div className='flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 py-5'>
          <p className='text-[13px] text-muted-foreground leading-[19px]'>
            {added.length > 0
              ? t("plugins.page.update.intro", { count: added.length })
              : t("plugins.page.update.introNothingNew")}
          </p>
          {added.length + kept.length > 0 ? (
            <h3 className='pt-1.5 font-semibold text-[11px] text-muted-foreground uppercase leading-[normal]'>
              {t("plugins.page.update.changes")}
            </h3>
          ) : null}
          {added.map((permission) => (
            <ChangeRow isNew key={permission.id} permission={permission} />
          ))}
          {kept.map((permission) => (
            <ChangeRow
              isNew={false}
              key={permission.id}
              permission={permission}
            />
          ))}
          {update.changelog.length > 0 ? (
            <div className='flex flex-col gap-2 rounded-[10px] bg-[#1E1A18] p-4'>
              <h3 className='font-semibold text-[11px] text-muted-foreground uppercase leading-[normal]'>
                {t("plugins.page.update.whatsNew", { version: update.version })}
              </h3>
              {update.changelog.map((entry) => (
                <p
                  className='text-[13px] text-foreground leading-[19px]'
                  key={entry}>
                  {entry}
                </p>
              ))}
            </div>
          ) : null}
          <div className='flex-1' />
          <p className='flex items-center gap-2 px-0.5 pt-1.5 text-[12px] text-muted-foreground leading-[17px]'>
            <InfoIcon className='shrink-0' size={14} />
            {t("plugins.page.update.note", { version: plugin.version })}
          </p>
        </div>
        <div className='flex shrink-0 items-center justify-end gap-2.5 border-border border-t px-6 pt-[13px] pb-[14px]'>
          <PageButton
            disabled={busy}
            onClick={() => discard.mutate()}
            variant='outline'>
            {t("plugins.page.update.keep", { version: plugin.version })}
          </PageButton>
          <PageButton
            disabled={busy}
            onClick={() => apply.mutate()}
            variant='primary'>
            <ArrowCircleUpIcon />
            {t("plugins.page.update.allow")}
          </PageButton>
        </div>
      </SheetContent>
    </Sheet>
  );
};
