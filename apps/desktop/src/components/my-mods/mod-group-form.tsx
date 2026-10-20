import { Button } from "@deadlock-mods/ui/components/button";
import { Input } from "@deadlock-mods/ui/components/input";
import { Label } from "@deadlock-mods/ui/components/label";
import { FolderPlus, Save } from "@deadlock-mods/ui/icons";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePersistedStore } from "@/lib/store";
import {
  EMPTY_MOD_GROUPS,
  isModGroupNameAvailable,
  MOD_GROUP_NAME_LIMIT,
} from "@/lib/store/slices/mod-groups";
import type { ModGroup, ProfileId } from "@/types/profiles";

export const ModGroupForm = ({
  profileId,
  group,
  submitLabel,
  onDone,
}: {
  profileId: ProfileId;
  group?: ModGroup;
  submitLabel?: string;
  onDone: (groupId: string | null) => void;
}) => {
  const { t } = useTranslation();
  const inputId = useId();
  const [name, setName] = useState(group?.name ?? "");
  const groups = usePersistedStore(
    (state) => state.profiles[profileId]?.modGroups ?? EMPTY_MOD_GROUPS,
  );
  const createGroup = usePersistedStore((state) => state.createModGroup);
  const renameGroup = usePersistedStore((state) => state.renameModGroup);
  const valid = isModGroupNameAvailable(groups, name, group?.id);
  const invalid = name.trim().length > 0 && !valid;

  return (
    <form
      className='space-y-3'
      onSubmit={(event) => {
        event.preventDefault();
        const groupId = group
          ? renameGroup(profileId, group.id, name) && group.id
          : createGroup(profileId, name);
        if (groupId) onDone(groupId);
      }}>
      <Label htmlFor={inputId}>{t("myMods.groups.name")}</Label>
      <Input
        id={inputId}
        value={name}
        maxLength={MOD_GROUP_NAME_LIMIT}
        placeholder={t("myMods.groups.placeholder")}
        aria-invalid={invalid}
        aria-describedby={invalid ? `${inputId}-help` : undefined}
        onChange={(event) => setName(event.target.value)}
      />
      {invalid && (
        <p id={`${inputId}-help`} className='text-xs text-muted-foreground'>
          {t("myMods.groups.duplicateName")}
        </p>
      )}
      <div className='flex justify-end gap-2'>
        <Button type='button' variant='outline' onClick={() => onDone(null)}>
          {t("common.cancel")}
        </Button>
        <Button
          type='submit'
          disabled={!valid}
          icon={
            group ? (
              <Save className='size-4' />
            ) : (
              <FolderPlus className='size-4' />
            )
          }>
          {submitLabel ??
            (group ? t("common.save") : t("myMods.groups.create"))}
        </Button>
      </div>
    </form>
  );
};
