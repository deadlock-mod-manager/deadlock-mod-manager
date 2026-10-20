import { Button } from "@deadlock-mods/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deadlock-mods/ui/components/popover";
import { FolderPlus } from "@deadlock-mods/ui/icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ModGroupForm } from "@/components/my-mods/mod-group-form";
import type { ProfileId } from "@/types/profiles";

export const CreateModGroup = ({
  profileId,
  disabled,
  onCreated,
}: {
  profileId: ProfileId;
  disabled: boolean;
  onCreated: () => void;
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size='sm' variant='outline' disabled={disabled}>
          <FolderPlus className='size-4' />
          {t("myMods.groups.new")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align='end'>
        <ModGroupForm
          profileId={profileId}
          onDone={(saved) => {
            setOpen(false);
            if (saved) onCreated();
          }}
        />
      </PopoverContent>
    </Popover>
  );
};
