import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import { FolderOpen, FolderPlus } from "@deadlock-mods/ui/icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ModGroupForm } from "@/components/my-mods/mod-group-form";
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
  const [creating, setCreating] = useState(false);
  const profileId = usePersistedStore((state) => state.activeProfileId);
  const groups = usePersistedStore(
    (state) => state.profiles[profileId]?.modGroups ?? EMPTY_MOD_GROUPS,
  );
  const assign = useMoveModsToGroup();
  const trigger = (
    <Button
      size='sm'
      variant='outline'
      disabled={disabled || modIds.length === 0}
      onClick={groups.length === 0 ? () => setCreating(true) : undefined}>
      <FolderOpen className='size-4' />
      {t("myMods.groups.moveTo")}
    </Button>
  );
  return (
    <Dialog open={creating} onOpenChange={setCreating}>
      {groups.length === 0 ? (
        trigger
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
          <DropdownMenuContent
            align='end'
            onCloseAutoFocus={(event) => {
              if (creating) event.preventDefault();
            }}>
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
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setCreating(true)}>
              <FolderPlus className='size-4' />
              {t("myMods.groups.new")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("myMods.groups.new")}</DialogTitle>
          <DialogDescription>
            {t("myMods.groups.description")}
          </DialogDescription>
        </DialogHeader>
        <ModGroupForm
          profileId={profileId}
          submitLabel={t("myMods.groups.createAndMove", {
            count: modIds.length,
          })}
          onDone={(groupId) => {
            setCreating(false);
            if (groupId) assign(profileId, modIds, groupId);
          }}
        />
      </DialogContent>
    </Dialog>
  );
};
