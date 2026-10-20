import { Button } from "@deadlock-mods/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import {
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  EllipsisVertical,
} from "@deadlock-mods/ui/icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CopyModGroups } from "@/components/my-mods/copy-mod-groups";
import { usePersistedStore } from "@/lib/store";
import type { ProfileId } from "@/types/profiles";

export const ModGroupTools = ({
  profileId,
  disabled,
}: {
  profileId: ProfileId;
  disabled: boolean;
}) => {
  const { t } = useTranslation();
  const setCollapsed = usePersistedStore(
    (state) => state.setModGroupsCollapsed,
  );
  const [copying, setCopying] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size='icon'
            variant='ghost'
            disabled={disabled}
            aria-label={t("myMods.groups.options")}>
            <EllipsisVertical className='size-4' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuItem onSelect={() => setCollapsed(profileId, false)}>
            <ChevronsUpDown className='size-4' />
            {t("myMods.groups.expandAll")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setCollapsed(profileId, true)}>
            <ChevronsDownUp className='size-4' />
            {t("myMods.groups.collapseAll")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCopying(true)}>
            <Copy className='size-4' />
            {t("myMods.groups.copy")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CopyModGroups
        sourceId={profileId}
        open={copying}
        onOpenChange={setCopying}
      />
    </>
  );
};
