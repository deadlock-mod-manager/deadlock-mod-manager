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
import {
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  FolderPlus,
  Folders,
} from "@deadlock-mods/ui/icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CopyModGroups } from "@/components/my-mods/copy-mod-groups";
import { ModGroupForm } from "@/components/my-mods/mod-group-form";
import { usePersistedStore } from "@/lib/store";
import { EMPTY_MOD_GROUPS } from "@/lib/store/slices/mod-groups";
import type { ProfileId } from "@/types/profiles";

export const ModGroupTools = ({
  profileId,
  disabled,
  onCreated,
}: {
  profileId: ProfileId;
  disabled: boolean;
  onCreated: () => void;
}) => {
  const { t } = useTranslation();
  const hasGroups = usePersistedStore(
    (state) =>
      (state.profiles[profileId]?.modGroups ?? EMPTY_MOD_GROUPS).length > 0,
  );
  const setCollapsed = usePersistedStore(
    (state) => state.setModGroupsCollapsed,
  );
  const [creating, setCreating] = useState(false);
  const [copying, setCopying] = useState(false);
  return (
    <>
      <Dialog open={creating} onOpenChange={setCreating}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant='ghost'
              className='h-8 gap-1.5 px-2.5 text-muted-foreground hover:text-foreground data-[state=open]:text-foreground'
              disabled={disabled}>
              <Folders className='size-4' />
              {t("myMods.groups.menu")}
              <ChevronDown className='size-3.5 opacity-60' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align='end'
            onCloseAutoFocus={(event) => {
              if (creating || copying) event.preventDefault();
            }}>
            <DropdownMenuItem onSelect={() => setCreating(true)}>
              <FolderPlus className='size-4' />
              {t("myMods.groups.new")}
            </DropdownMenuItem>
            {hasGroups && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => setCollapsed(profileId, false)}>
                  <ChevronsUpDown className='size-4' />
                  {t("myMods.groups.expandAll")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => setCollapsed(profileId, true)}>
                  <ChevronsDownUp className='size-4' />
                  {t("myMods.groups.collapseAll")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setCopying(true)}>
                  <Copy className='size-4' />
                  {t("myMods.groups.copy")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("myMods.groups.new")}</DialogTitle>
            <DialogDescription>
              {t("myMods.groups.description")}
            </DialogDescription>
          </DialogHeader>
          <ModGroupForm
            profileId={profileId}
            onDone={(groupId) => {
              setCreating(false);
              if (groupId) onCreated();
            }}
          />
        </DialogContent>
      </Dialog>
      <CopyModGroups
        sourceId={profileId}
        open={copying}
        onOpenChange={setCopying}
      />
    </>
  );
};
