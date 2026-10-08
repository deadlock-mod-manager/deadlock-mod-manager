import { Button } from "@deadlock-mods/ui/components/button";
import {
  ArrowsClockwiseIcon,
  CheckIcon,
  FilesIcon,
  GaugeIcon,
  type Icon,
  PackageIcon,
  SlidersHorizontalIcon,
  TerminalWindowIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { CrashCheck } from "@/hooks/use-crash-check";
import type { SessionChange } from "@/lib/launch-health/types";
import { usePersistedStore } from "@/lib/store";
import {
  configName,
  formatModNames,
  formatRelative,
  latestTimestamp,
} from "./format";

type RowProps = {
  icon: Icon;
  title: string;
  meta?: string | null;
  action?: ReactNode;
};

const Row = ({ icon: RowIcon, title, meta, action }: RowProps) => (
  <li className='flex items-center gap-3 rounded-md border bg-card/40 px-3 py-2.5'>
    <RowIcon className='size-4 shrink-0 text-primary' weight='duotone' />
    <div className='min-w-0 flex-1'>
      <p className='font-medium text-sm'>{title}</p>
      {meta && <p className='text-muted-foreground text-xs'>{meta}</p>}
    </div>
    {action}
  </li>
);

const DoneLabel = ({ children }: { children: ReactNode }) => (
  <span className='flex items-center gap-1 text-muted-foreground text-xs'>
    <CheckIcon className='size-3.5' weight='bold' />
    {children}
  </span>
);

const joinMeta = (parts: (string | null | undefined)[]) =>
  parts.filter(Boolean).join(", ");

type ChangeRowProps = {
  change: SessionChange;
  crashCheck: CrashCheck;
  onOpenSettings: (tab: "autoexec" | "launch-options") => void;
};

export const ChangeRow = ({
  change,
  crashCheck,
  onOpenSettings,
}: ChangeRowProps) => {
  const { t, i18n } = useTranslation();
  const userConfigs = usePersistedStore((state) => state.perfUserConfigs);

  switch (change.kind) {
    case "perfConfig": {
      const name = configName(
        change.config,
        userConfigs[change.config.configId]?.name,
      );
      return (
        <Row
          action={
            crashCheck.configTurnedOff ? (
              <DoneLabel>{t("launchHealth.actions.turnedOff")}</DoneLabel>
            ) : (
              <Button
                disabled={crashCheck.turningOffConfig}
                onClick={crashCheck.turnOffConfig}
                size='sm'
                variant='outline'>
                {t("launchHealth.actions.turnOff")}
              </Button>
            )
          }
          icon={GaugeIcon}
          meta={joinMeta([
            formatRelative(change.config.appliedAt),
            change.config.settingCount !== null
              ? t("launchHealth.changes.settingCount", {
                  count: change.config.settingCount,
                })
              : null,
          ])}
          title={t(`launchHealth.changes.perfConfig.${change.change}`, {
            name,
          })}
        />
      );
    }
    case "modsAdded": {
      const count = change.mods.length;
      return (
        <Row
          action={
            crashCheck.modsDisabled ? (
              <DoneLabel>{t("launchHealth.actions.disabled")}</DoneLabel>
            ) : (
              <Button
                disabled={crashCheck.disableMods.isPending}
                onClick={() => crashCheck.disableMods.mutate(change.mods)}
                size='sm'
                variant='outline'>
                {count === 2
                  ? t("launchHealth.actions.disableBoth")
                  : t("launchHealth.actions.disable", { count })}
              </Button>
            )
          }
          icon={PackageIcon}
          meta={formatRelative(
            latestTimestamp(
              change.mods.map((mod) => mod.enabledAt ?? mod.downloadedAt),
            ),
          )}
          title={t("launchHealth.changes.modsAdded", {
            count,
            names: formatModNames(t, i18n.language, change.mods),
          })}
        />
      );
    }
    case "modsUpdated":
      return (
        <Row
          icon={ArrowsClockwiseIcon}
          meta={formatRelative(
            latestTimestamp(change.mods.map((mod) => mod.downloadedAt)),
          )}
          title={t("launchHealth.changes.modsUpdated", {
            count: change.mods.length,
            names: formatModNames(t, i18n.language, change.mods),
          })}
        />
      );
    case "autoexec":
      return (
        <Row
          action={
            <Button
              onClick={() => onOpenSettings("autoexec")}
              size='sm'
              variant='ghost'>
              {t("launchHealth.actions.open")}
            </Button>
          }
          icon={TerminalWindowIcon}
          title={t("launchHealth.changes.autoexec")}
        />
      );
    case "launchOptions":
      return (
        <Row
          action={
            <Button
              onClick={() => onOpenSettings("launch-options")}
              size='sm'
              variant='ghost'>
              {t("launchHealth.actions.open")}
            </Button>
          }
          icon={SlidersHorizontalIcon}
          meta={joinMeta([
            change.added.length > 0
              ? t("launchHealth.changes.argumentsAdded", {
                  arguments: change.added.join(" "),
                })
              : null,
            change.removed.length > 0
              ? t("launchHealth.changes.argumentsRemoved", {
                  arguments: change.removed.join(" "),
                })
              : null,
          ])}
          title={t("launchHealth.changes.launchOptions")}
        />
      );
    case "addonFiles":
      return (
        <Row
          icon={FilesIcon}
          meta={change.paths.join(", ")}
          title={t("launchHealth.changes.addonFiles")}
        />
      );
  }
};
