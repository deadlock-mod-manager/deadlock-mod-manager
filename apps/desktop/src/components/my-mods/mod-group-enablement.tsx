import { Button } from "@deadlock-mods/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { Power } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { isInstalledModWithVpks } from "@/lib/mods/installed-helpers";
import { usePersistedStore } from "@/lib/store";
import { cn } from "@/lib/utils";
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
  const label = t(
    canEnable ? "myMods.groups.enable" : "myMods.groups.disable",
    {
      name: group.name,
    },
  );
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
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size='icon'
            variant='ghost'
            aria-label={label}
            disabled={actions.busy || (!canEnable && enabled === 0)}
            onClick={() =>
              canEnable ? actions.enable(ids) : actions.disable(ids)
            }>
            <Power
              className={cn(
                "size-4 transition-colors duration-200",
                !canEnable && enabled > 0 && "text-primary",
              )}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </div>
  );
};
