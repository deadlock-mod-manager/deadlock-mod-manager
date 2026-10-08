import { Button } from "@deadlock-mods/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { PencilSimpleIcon, TrashIcon, UserIcon } from "@phosphor-icons/react";
import { formatDistanceToNow } from "date-fns";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm, usePrompt } from "@/components/providers/alert-dialog";
import type { UserListItem } from "@/lib/performance/config-list";
import { usePersistedStore } from "@/lib/store";
import { usePerformanceUi } from "../performance-context";
import { ApplyConfigButton } from "./apply-config-button";
import {
  CardFooter,
  Chip,
  ConfigCardShell,
  TierLabel,
  TierMeter,
} from "./card-parts";
import { useOriginLabel } from "./use-origin-label";

const IconAction = ({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        aria-label={label}
        className='h-7 w-7 text-muted-foreground'
        onClick={onClick}
        size='icon'
        variant='ghost'>
        {children}
      </Button>
    </TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>
);

export const UserConfigCard = ({
  item,
  active,
}: {
  item: UserListItem;
  active: boolean;
}) => {
  const { t } = useTranslation();
  const { openDetails } = usePerformanceUi();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const originLabel = useOriginLabel();
  const renameUserPerfConfig = usePersistedStore(
    (state) => state.renameUserPerfConfig,
  );
  const removeUserPerfConfig = usePersistedStore(
    (state) => state.removeUserPerfConfig,
  );
  const { config } = item;

  const handleRename = async () => {
    const name = await prompt({
      title: t("performance.configs.rename.title"),
      actionButton: t("performance.configs.rename.action"),
      actionButtonVariant: "default",
      defaultValue: config.name,
      inputProps: {
        "aria-label": t("performance.configs.rename.label"),
        maxLength: 80,
      },
    });
    const trimmed = name?.trim();
    if (trimmed && trimmed !== config.name) {
      renameUserPerfConfig(config.id, trimmed);
    }
  };

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: t("performance.configs.delete.title", { name: config.name }),
      body: active
        ? t("performance.configs.delete.bodyActive")
        : t("performance.configs.delete.body"),
      actionButton: t("performance.configs.delete.action"),
      tone: "destructive",
      icon: TrashIcon,
    });
    if (confirmed) removeUserPerfConfig(config.id);
  };

  return (
    <ConfigCardShell active={active}>
      <div className='flex items-center justify-between gap-2'>
        {item.tier ? (
          <TierLabel tier={item.tier} />
        ) : (
          <span className='inline-flex items-center gap-1.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide'>
            <UserIcon aria-hidden className='size-3.5' />
            {t("performance.configs.yours")}
          </span>
        )}
        <div className='flex items-center gap-1'>
          {item.tier && <TierMeter tier={item.tier} />}
          <IconAction
            label={t("performance.configs.rename.label")}
            onClick={handleRename}>
            <PencilSimpleIcon aria-hidden />
          </IconAction>
          <IconAction
            label={t("performance.configs.delete.label")}
            onClick={handleDelete}>
            <TrashIcon aria-hidden />
          </IconAction>
        </div>
      </div>
      <div className='min-w-0'>
        <h3 className='truncate font-semibold text-base' title={config.name}>
          {config.name}
        </h3>
        <p className='truncate text-muted-foreground text-xs'>
          {originLabel(config)}
        </p>
      </div>
      <div className='flex flex-wrap gap-1.5'>
        <Chip>
          {t("performance.configs.settingsCount", {
            count: config.entries.length,
          })}
        </Chip>
        {config.videoSettings.length > 0 && (
          <Chip>{t("performance.configs.suggestsVideoSettings")}</Chip>
        )}
      </div>
      <CardFooter
        source={t("performance.configs.created", {
          time: formatDistanceToNow(new Date(config.createdAt), {
            addSuffix: true,
          }),
        })}>
        <Button
          onClick={() => openDetails(config.id)}
          size='sm'
          variant='ghost'>
          {t("performance.configs.details")}
        </Button>
        <ApplyConfigButton
          config={{ kind: "user", config }}
          entryPoint='card'
        />
      </CardFooter>
    </ConfigCardShell>
  );
};
