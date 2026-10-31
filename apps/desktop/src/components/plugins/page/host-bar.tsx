import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import {
  ArrowClockwiseIcon,
  DotsThreeIcon,
  FileZipIcon,
  KeyIcon,
  PowerIcon,
  PuzzlePieceIcon,
  ShieldCheckIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { formatPluginSize } from "@/components/plugins/plugin-format";
import { PluginTile, tint } from "@/components/plugins/plugin-identity";
import type { ExternalPluginSummary } from "@/types/generated/ExternalPluginSummary";
import { PageButton } from "./page-button";
import { usePluginActions } from "./use-plugin-actions";

export type HostStatus = { color: string; labelKey: string };

/** The rounded status pill the plugin page's host bar draws next to the name. */
const HostStatusPill = ({ status }: { status: HostStatus }) => {
  const { t } = useTranslation();
  return (
    <span
      className='flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5'
      style={{ backgroundColor: tint(status.color, "1A") }}>
      <span
        className='size-1.5 rounded-full'
        style={{ backgroundColor: status.color }}
      />
      <span
        className='font-medium text-[11px] leading-[normal]'
        style={{ color: status.color }}>
        {t(status.labelKey)}
      </span>
    </span>
  );
};

type HostBarProps = {
  plugin: ExternalPluginSummary;
  status: HostStatus;
  showAccess: boolean;
  onOpenAccess: () => void;
  /** Omit when there is no frame to reload. */
  onReload?: () => void;
};

export const HostBar = ({
  plugin,
  status,
  showAccess,
  onOpenAccess,
  onReload,
}: HostBarProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const actions = usePluginActions(plugin);
  const showPackageSize =
    plugin.status === "needsConsent" && plugin.source === "file";
  const canTurnOff = plugin.status === "enabled";
  const canTurnOn =
    plugin.status === "disabled" || plugin.status === "quarantined";

  return (
    <div className='flex shrink-0 items-center gap-[14px] border-border border-b px-6 pt-4 pb-[15px]'>
      <PluginTile
        accent={plugin.accent}
        fillAlpha='26'
        glyphSize={20}
        icon={plugin.icon}
        outlineAlpha='33'
        radius={10}
        size={40}
      />
      <div className='flex min-w-0 flex-col gap-1'>
        <div className='flex min-w-0 items-center gap-2.5'>
          <h1 className='truncate font-semibold text-[17px] text-foreground leading-[normal]'>
            {plugin.name}
          </h1>
          <HostStatusPill status={status} />
        </div>
        <div className='flex items-center gap-3 text-[12px] text-muted-foreground leading-[normal]'>
          <span className='font-mono text-[11px]'>
            {t("plugins.page.hostBar.version", { version: plugin.version })}
          </span>
          {plugin.author ? (
            <span className='truncate'>
              {t("plugins.page.hostBar.by", { author: plugin.author })}
            </span>
          ) : null}
          <span className='flex shrink-0 items-center gap-[5px]'>
            {showPackageSize ? (
              <>
                <FileZipIcon size={13} />
                {formatPluginSize(plugin.packageSize)}
              </>
            ) : (
              <>
                <ShieldCheckIcon size={13} />
                {t("plugins.page.hostBar.sandboxed")}
              </>
            )}
          </span>
        </div>
      </div>
      <div className='h-px flex-1' />
      {showAccess ? (
        <PageButton onClick={onOpenAccess} variant='outline'>
          <KeyIcon />
          {t("plugins.page.hostBar.access")}
        </PageButton>
      ) : null}
      {onReload ? (
        <PageButton
          aria-label={t("plugins.page.hostBar.reload")}
          onClick={onReload}
          title={t("plugins.page.hostBar.reload")}
          variant='icon'>
          <ArrowClockwiseIcon />
        </PageButton>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <PageButton
            aria-label={t("plugins.page.hostBar.more")}
            title={t("plugins.page.hostBar.more")}
            variant='icon'>
            <DotsThreeIcon />
          </PageButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='min-w-44'>
          <DropdownMenuItem onSelect={() => navigate(actions.managePath)}>
            <PuzzlePieceIcon />
            {t("plugins.page.managePlugins")}
          </DropdownMenuItem>
          {canTurnOff || canTurnOn ? (
            <DropdownMenuItem
              disabled={actions.busy}
              onSelect={() => actions.setEnabled.mutate(canTurnOn)}>
              <PowerIcon />
              {t(
                canTurnOn
                  ? "plugins.page.hostBar.turnOn"
                  : "plugins.page.hostBar.turnOff",
              )}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className='text-destructive focus:text-destructive'
            disabled={actions.busy}
            onSelect={() => void actions.confirmRemove()}>
            <TrashIcon />
            {t("plugins.page.hostBar.remove")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
