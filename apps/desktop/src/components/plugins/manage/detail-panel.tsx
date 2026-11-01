import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  ArrowRightIcon,
  CopyIcon,
  DotsThreeIcon,
  LockKeyIcon,
  PuzzlePieceIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { usePluginActions } from "@/components/plugins/access/use-plugin-actions";
import { AboutTab } from "@/components/plugins/manage/about-tab";
import { AccessTab } from "@/components/plugins/manage/access-tab";
import { ActivityTab } from "@/components/plugins/manage/activity-tab";
import { Badge } from "@/components/plugins/manage/badge";
import { Health } from "@/components/plugins/manage/health";
import { PANEL_CLASS } from "@/components/plugins/manage/panel-styles";
import { INSET_OUTLINE } from "@/components/plugins/manage/plugin-styles";
import { RowButton } from "@/components/plugins/manage/row-button";
import { formatShortDate, shortHash } from "@/components/plugins/plugin-format";
import { PluginTile } from "@/components/plugins/plugin-identity";
import { cn } from "@/lib/utils";
import type { ExternalPluginSummary } from "@/types/generated/ExternalPluginSummary";

export const PANEL_TABS = ["access", "activity", "about"] as const;

export type PanelTab = (typeof PANEL_TABS)[number];

type DetailPanelProps = {
  plugin: ExternalPluginSummary;
  tab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
};

/** Everything about one installed plugin: identity, health, access, history. */
export const DetailPanel = ({ plugin, tab, onTabChange }: DetailPanelProps) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { revoke, remove, confirmRevoke, confirmRemove } =
    usePluginActions(plugin);
  const openPage = () => navigate(`/ext/${encodeURIComponent(plugin.id)}`);

  const copyId = async () => {
    await navigator.clipboard.writeText(plugin.id);
    toast.success(t("plugins.manage.panel.copiedId"));
  };

  return (
    <aside aria-label={plugin.name} className={PANEL_CLASS}>
      <div className='flex w-full shrink-0 flex-col gap-[14px] px-[22px] pt-[20px] pb-[16px]'>
        <div className='flex w-full items-center gap-[14px]'>
          <PluginTile
            accent={plugin.accent}
            fillAlpha='1A'
            glyphSize={26}
            icon={plugin.icon}
            outlineAlpha='26'
            radius={12}
            size={52}
          />
          <div className='flex min-w-0 flex-1 flex-col gap-[4px]'>
            <span className='truncate font-bold text-[17px] text-foreground leading-[normal]'>
              {plugin.name}
            </span>
            {plugin.author && (
              <span className='truncate text-[#A3A3A3] text-[12px] leading-[normal]'>
                {t("plugins.manage.panel.by", { author: plugin.author })}
              </span>
            )}
          </div>
          <button
            className='flex shrink-0 items-center gap-[8px] rounded-[8px] bg-primary px-[14px] py-[8px] font-semibold text-[14px] text-primary-foreground leading-[normal] hover:bg-primary/90'
            onClick={openPage}
            type='button'>
            <ArrowRightIcon color='currentColor' size={16} />
            {t("plugins.manage.panel.open")}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label={t("plugins.manage.panel.more")}
                className={cn(
                  "flex size-[34px] shrink-0 items-center justify-center rounded-[8px] outline-[#262626] hover:bg-[#1E1A18]",
                  INSET_OUTLINE,
                )}
                type='button'>
                <DotsThreeIcon color='#A3A3A3' size={16} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='min-w-[180px]'>
              <DropdownMenuItem onSelect={openPage}>
                <PuzzlePieceIcon size={14} />
                {t("plugins.manage.panel.openPage")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void copyId()}>
                <CopyIcon size={14} />
                {t("plugins.manage.panel.copyId")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className='text-[#F87171] focus:text-[#F87171]'
                onSelect={() => void confirmRemove()}>
                <TrashIcon size={14} />
                {t("plugins.manage.panel.remove")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className='flex flex-wrap items-center gap-[6px]'>
          <Badge>
            {t("plugins.manage.panel.version", { version: plugin.version })}
          </Badge>
          <Badge>
            {plugin.source === "catalog"
              ? t("plugins.manage.panel.fromCatalog")
              : t("plugins.manage.panel.fromFile")}
          </Badge>
          <Badge mono>
            {t("plugins.manage.panel.hash", {
              hash: shortHash(plugin.packageHash),
            })}
          </Badge>
          {plugin.hasUi && (
            <Badge>{t("plugins.manage.panel.pageInSidebar")}</Badge>
          )}
        </div>
        <Health plugin={plugin} />
      </div>

      <div
        className='flex h-[35px] w-full shrink-0 gap-[18px] border-[#FFFFFF0F] border-b px-[22px]'
        role='tablist'>
        {PANEL_TABS.map((value) => (
          <button
            aria-selected={tab === value}
            className={cn(
              "flex h-[34px] border-b-2 pt-[8px] font-semibold text-[13px] leading-[normal] transition-colors",
              tab === value
                ? "border-primary text-foreground"
                : "border-transparent text-[#A3A3A3] hover:text-foreground",
            )}
            key={value}
            onClick={() => onTabChange(value)}
            role='tab'
            type='button'>
            {t(`plugins.manage.panel.tabs.${value}`)}
          </button>
        ))}
      </div>

      <div
        className='flex min-h-0 w-full flex-1 flex-col gap-[12px] overflow-y-auto px-[22px] py-[16px] [&>*]:shrink-0'
        role='tabpanel'>
        {tab === "access" && (
          <AccessTab onSeeAll={() => onTabChange("activity")} plugin={plugin} />
        )}
        {tab === "activity" && <ActivityTab plugin={plugin} />}
        {tab === "about" && <AboutTab plugin={plugin} />}
      </div>

      <div className='flex w-full shrink-0 items-center gap-[8px] border-[#FFFFFF0F] border-t bg-[#0B0A09] px-[22px] pt-[11px] pb-[12px]'>
        <span className='text-[#A3A3A3] text-[12px] leading-[normal]'>
          {plugin.grant
            ? t("plugins.manage.panel.granted", {
                date: formatShortDate(i18n.language, plugin.grant.grantedAt),
              })
            : t("plugins.manage.panel.notGranted")}
        </span>
        <span className='h-px flex-1' />
        <button
          className='flex items-center gap-[6px] rounded-[8px] px-[10px] py-[6px] text-[#F87171] text-[13px] leading-[normal] hover:bg-[#F8717112] disabled:pointer-events-none disabled:opacity-50'
          disabled={!plugin.grant || revoke.isPending}
          onClick={() => void confirmRevoke()}
          type='button'>
          <LockKeyIcon color='currentColor' size={16} />
          {t("plugins.access.actions.revokeAll")}
        </button>
        <RowButton
          className='text-[#F87171]'
          disabled={remove.isPending}
          icon={TrashIcon}
          onClick={() => void confirmRemove()}>
          {t("plugins.manage.panel.remove")}
        </RowButton>
      </div>
    </aside>
  );
};
