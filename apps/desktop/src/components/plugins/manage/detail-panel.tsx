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
  CompassIcon,
  CopyIcon,
  DotsThreeIcon,
  LockKeyIcon,
  PuzzlePieceIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { AlwaysBlocked } from "@/components/plugins/access/always-blocked";
import { PermissionGrantCards } from "@/components/plugins/access/grant-cards";
import { usePluginActions } from "@/components/plugins/access/use-plugin-actions";
import { ActivityEvents } from "@/components/plugins/manage/activity-list";
import {
  INSET_OUTLINE,
  RowButton,
} from "@/components/plugins/manage/plugin-row";
import {
  formatDateTime,
  formatPluginSize,
  formatShortDate,
  shortHash,
  useRelativeTime,
} from "@/components/plugins/plugin-format";
import { PluginTile } from "@/components/plugins/plugin-identity";
import { pageState, TONE_COLOR } from "@/components/plugins/plugin-status";
import { useExternalPluginActivity } from "@/hooks/use-external-plugin-activity";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import type { ExternalPluginSummary } from "@/types/generated/ExternalPluginSummary";

export const PANEL_TABS = ["access", "activity", "about"] as const;
export type PanelTab = (typeof PANEL_TABS)[number];

const RECENT_EVENTS = 2;

const PANEL_CLASS = cn(
  "flex h-full w-[480px] shrink-0 flex-col overflow-hidden rounded-[14px] bg-card outline-[#FFFFFF0F]",
  INSET_OUTLINE,
);

const Badge = ({ children, mono }: { children: ReactNode; mono?: boolean }) => (
  <span
    className={cn(
      "flex items-center gap-[4px] rounded-[6px] px-[8px] py-[2px] font-medium text-[#A3A3A3] text-[11px] leading-[normal] outline-[#262626]",
      INSET_OUTLINE,
      mono && "font-mono",
    )}>
    {children}
  </span>
);

const Stat = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className='flex flex-col gap-[3px]'>
    <span className='font-bold text-[#7C756E] text-[9px] uppercase leading-[normal] tracking-[1px]'>
      {label}
    </span>
    <div className='flex items-center gap-[6px] font-semibold text-[13px] text-foreground leading-[normal]'>
      {children}
    </div>
  </div>
);

const Health = ({ plugin }: { plugin: ExternalPluginSummary }) => {
  const { t } = useTranslation();
  const relativeTime = useRelativeTime();
  const state = pageState(
    plugin,
    "plugins.state.needsSetup",
    "plugins.state.stoppedAfterErrors",
  );
  const color = TONE_COLOR[state.tone];
  return (
    <div
      className={cn(
        "flex w-full items-center justify-between rounded-[10px] bg-background px-[14px] py-[10px] outline-[#FFFFFF0A]",
        INSET_OUTLINE,
      )}>
      <Stat label={t("plugins.manage.panel.worker")}>
        <span
          className='size-[7px] rounded-full'
          style={{ backgroundColor: color }}
        />
        <span style={{ color }}>{t(state.labelKey)}</span>
      </Stat>
      <Stat label={t("plugins.manage.panel.lastCheck")}>
        {plugin.lastTickAt
          ? relativeTime(plugin.lastTickAt)
          : t("plugins.manage.panel.never")}
      </Stat>
      <Stat label={t("plugins.manage.panel.restarts")}>
        {t("plugins.manage.panel.restartsToday", {
          count: plugin.restartsToday,
        })}
      </Stat>
      <Stat label={t("plugins.manage.panel.storage")}>
        {formatPluginSize(plugin.storageBytes)}
      </Stat>
    </div>
  );
};

const SectionLabel = ({ children }: { children: ReactNode }) => (
  <span className='font-bold text-[#7C756E] text-[10px] uppercase leading-[normal] tracking-[1.1px]'>
    {children}
  </span>
);

const AccessTab = ({
  plugin,
  onSeeAll,
}: {
  plugin: ExternalPluginSummary;
  onSeeAll: () => void;
}) => {
  const { t } = useTranslation();
  const { data: activity = [] } = useExternalPluginActivity(plugin.id);
  return (
    <>
      <p className='w-full text-[#A3A3A3] text-[12px] leading-[17px]'>
        {t("plugins.manage.panel.intro")}
      </p>
      <PermissionGrantCards plugin={plugin} />
      <AlwaysBlocked plugin={plugin} />
      {activity.length > 0 && (
        <div className='flex w-full flex-col gap-[2px] px-[2px] pt-[6px]'>
          <div className='flex w-full items-center pb-[4px]'>
            <SectionLabel>
              {t("plugins.manage.panel.recentActivity")}
            </SectionLabel>
            <span className='h-px flex-1' />
            <button
              className='text-[12px] text-primary leading-[normal] hover:underline'
              onClick={onSeeAll}
              type='button'>
              {t("plugins.manage.panel.seeAll")}
            </button>
          </div>
          <ActivityEvents entries={activity.slice(0, RECENT_EVENTS)} />
        </div>
      )}
    </>
  );
};

const ActivityTab = ({ plugin }: { plugin: ExternalPluginSummary }) => {
  const { t } = useTranslation();
  const activityQuery = useExternalPluginActivity(plugin.id);
  if (activityQuery.isError) {
    return (
      <p className='text-[#F87171] text-[12px] leading-[normal]' role='alert'>
        {t("plugins.activity.loadFailed", {
          message: getErrorMessage(activityQuery.error),
        })}
      </p>
    );
  }
  const entries = activityQuery.data ?? [];
  if (entries.length === 0) {
    return (
      <p className='text-[#A3A3A3] text-[12px] leading-[17px]'>
        {activityQuery.isPending
          ? t("common.loading")
          : t("plugins.activity.empty")}
      </p>
    );
  }
  return (
    <div className='flex w-full flex-col gap-[2px] px-[2px]'>
      <ActivityEvents entries={entries} />
    </div>
  );
};

const AboutRow = ({
  label,
  children,
  mono,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) => (
  <div className='flex w-full items-start gap-[12px] py-[6px]'>
    <span className='w-[96px] shrink-0 text-[#A3A3A3] text-[12px] leading-[normal]'>
      {label}
    </span>
    <span
      className={cn(
        "min-w-0 flex-1 break-all text-[12px] text-foreground leading-[normal]",
        mono && "font-mono text-[11px]",
      )}>
      {children}
    </span>
  </div>
);

const AboutTab = ({ plugin }: { plugin: ExternalPluginSummary }) => {
  const { t, i18n } = useTranslation();
  return (
    <>
      <div className='flex w-full flex-col gap-[6px]'>
        <SectionLabel>{t("plugins.manage.about.description")}</SectionLabel>
        <p className='text-[12px] text-foreground leading-[17px]'>
          {plugin.description ?? t("plugins.manage.about.noDescription")}
        </p>
      </div>
      <div className='flex w-full flex-col gap-[6px]'>
        <SectionLabel>
          {t("plugins.manage.about.changelog", { version: plugin.version })}
        </SectionLabel>
        {plugin.changelog.length > 0 ? (
          <ul className='flex list-disc flex-col gap-[4px] pl-[16px] text-[12px] text-foreground leading-[17px]'>
            {plugin.changelog.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className='text-[#A3A3A3] text-[12px] leading-[17px]'>
            {t("plugins.manage.about.noChangelog")}
          </p>
        )}
      </div>
      <div className='flex w-full flex-col'>
        <AboutRow label={t("plugins.manage.about.author")}>
          {plugin.author ?? t("plugins.manage.about.unknownAuthor")}
        </AboutRow>
        <AboutRow label={t("plugins.manage.about.version")} mono>
          {plugin.version}
        </AboutRow>
        <AboutRow label={t("plugins.manage.about.source")}>
          {plugin.source === "catalog"
            ? t("plugins.manage.panel.fromCatalog")
            : t("plugins.manage.panel.fromFile")}
        </AboutRow>
        <AboutRow label={t("plugins.manage.about.installedAt")}>
          {formatDateTime(i18n.language, plugin.installedAt)}
        </AboutRow>
        <AboutRow label={t("plugins.manage.about.updatedAt")}>
          {formatDateTime(i18n.language, plugin.updatedAt)}
        </AboutRow>
        <AboutRow label={t("plugins.manage.about.hash")} mono>
          {plugin.packageHash}
        </AboutRow>
      </div>
    </>
  );
};

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

/** The detail panel's place when no external plugin is installed. */
export const EmptyDetailPanel = ({ onBrowse }: { onBrowse: () => void }) => {
  const { t } = useTranslation();
  return (
    <aside
      className={cn(
        PANEL_CLASS,
        "items-center justify-center gap-[14px] p-[32px]",
      )}>
      <span className='flex size-[52px] items-center justify-center rounded-[12px] bg-[#FFFFFF0A]'>
        <PuzzlePieceIcon color='#EFE0BE' size={26} />
      </span>
      <div className='flex max-w-[320px] flex-col items-center gap-[4px] text-center'>
        <span className='font-bold text-[17px] text-foreground leading-[normal]'>
          {t("plugins.manage.panel.emptyTitle")}
        </span>
        <span className='text-[#A3A3A3] text-[12px] leading-[17px]'>
          {t("plugins.manage.panel.emptyBody")}
        </span>
      </div>
      <RowButton icon={CompassIcon} onClick={onBrowse}>
        {t("plugins.manage.findMore.browse")}
      </RowButton>
    </aside>
  );
};
