import { Button } from "@deadlock-mods/ui/components/button";
import { Power, PowerOff } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { isInstalledModWithVpks } from "@/lib/mods/installed-helpers";
import { usePersistedStore } from "@/lib/store";
import { ModStatus } from "@/types/mods";
import type { ModGroup } from "@/types/profiles";

export type ModGroupActions = {
  busy: boolean;
  enable: (ids: ReadonlySet<string>) => void;
  disable: (ids: ReadonlySet<string>) => void;
};

export const ModGroupEnablement = ({
  group,
  actions,
}: {
  group: ModGroup;
  actions: ModGroupActions;
}) => {
  const { t } = useTranslation();
  const mods = usePersistedStore((state) => state.localMods);
  const ids = new Set(group.modIds);
  const members = mods.filter((mod) => ids.has(mod.remoteId));
  const enabled = members.filter(isInstalledModWithVpks).length;
  const canEnable = members.some((mod) => mod.status === ModStatus.Downloaded);
  return (
    <div className='flex shrink-0 items-center gap-1'>
      <span
        className='mr-1 text-xs text-muted-foreground'
        data-group-enablement>
        {t("myMods.groups.enabledCount", {
          count: enabled,
          total: members.length,
        })}
      </span>
      <Button
        size='icon'
        variant='ghost'
        aria-label={t("myMods.groups.enable", { name: group.name })}
        title={t("myMods.groups.enable", { name: group.name })}
        disabled={actions.busy || !canEnable}
        onClick={() => actions.enable(ids)}>
        <Power className='size-4' />
      </Button>
      <Button
        size='icon'
        variant='ghost'
        aria-label={t("myMods.groups.disable", { name: group.name })}
        title={t("myMods.groups.disable", { name: group.name })}
        disabled={actions.busy || enabled === 0}
        onClick={() => actions.disable(ids)}>
        <PowerOff className='size-4' />
      </Button>
    </div>
  );
};
