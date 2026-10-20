import { Button } from "@deadlock-mods/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import { FolderOpen } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { useMoveModsToGroup } from "@/hooks/use-move-mods-to-group";
import { usePersistedStore } from "@/lib/store";
import { EMPTY_MOD_GROUPS } from "@/lib/store/slices/mod-groups";

export const MoveToModGroup = ({
  modIds,
  disabled,
}: {
  modIds: readonly string[];
  disabled: boolean;
}) => {
  const { t } = useTranslation();
  const profileId = usePersistedStore((state) => state.activeProfileId);
  const groups = usePersistedStore(
    (state) => state.profiles[profileId]?.modGroups ?? EMPTY_MOD_GROUPS,
  );
  const assign = useMoveModsToGroup();
  if (groups.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size='sm'
          variant='outline'
          disabled={disabled || modIds.length === 0}>
          <FolderOpen className='size-4' />
          {t("myMods.groups.moveTo")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        {groups.map((group) => (
          <DropdownMenuItem
            key={group.id}
            onSelect={() => assign(profileId, modIds, group.id)}>
            {group.name}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onSelect={() => assign(profileId, modIds, null)}>
          {t("myMods.groups.ungrouped")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
