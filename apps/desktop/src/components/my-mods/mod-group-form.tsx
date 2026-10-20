import { Button } from "@deadlock-mods/ui/components/button";
import { Input } from "@deadlock-mods/ui/components/input";
import { Label } from "@deadlock-mods/ui/components/label";
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
  onDone,
}: {
  profileId: ProfileId;
  group?: ModGroup;
  onDone: (saved: boolean) => void;
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

  return (
    <form
      className='space-y-3'
      onSubmit={(event) => {
        event.preventDefault();
        const saved = group
          ? renameGroup(profileId, group.id, name)
          : createGroup(profileId, name);
        if (saved) onDone(true);
      }}>
      <Label htmlFor={inputId}>{t("myMods.groups.name")}</Label>
      <Input
        id={inputId}
        value={name}
        maxLength={MOD_GROUP_NAME_LIMIT}
        placeholder={t("myMods.groups.placeholder")}
        aria-invalid={name.trim().length > 0 && !valid}
        aria-describedby={`${inputId}-help`}
        onChange={(event) => setName(event.target.value)}
      />
      <p id={`${inputId}-help`} className='text-xs text-muted-foreground'>
        {name.trim().length > 0 && !valid
          ? t("myMods.groups.duplicateName")
          : t("myMods.groups.description")}
      </p>
      <div className='flex justify-end gap-2'>
        <Button
          type='button'
          size='sm'
          variant='ghost'
          onClick={() => onDone(false)}>
          {t("common.cancel")}
        </Button>
        <Button type='submit' size='sm' disabled={!valid}>
          {group ? t("common.save") : t("myMods.groups.create")}
        </Button>
      </div>
    </form>
  );
};
