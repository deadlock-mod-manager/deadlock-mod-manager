import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { usePersistedStore } from "@/lib/store";
import { createProfileId, type ProfileId } from "@/types/profiles";

export const CopyModGroups = ({
  sourceId,
  open,
  onOpenChange,
}: {
  sourceId: ProfileId;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useTranslation();
  const profiles = usePersistedStore((state) => state.profiles);
  const copy = usePersistedStore((state) => state.copyModGroups);
  const [targetId, setTargetId] = useState("");
  const target = profiles[createProfileId(targetId)];
  const source = profiles[sourceId];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("myMods.groups.copy")}</DialogTitle>
          <DialogDescription>
            {t("myMods.groups.copyDescription", { name: source?.name })}
          </DialogDescription>
        </DialogHeader>
        <Select value={targetId} onValueChange={setTargetId}>
          <SelectTrigger aria-label={t("myMods.groups.destination")}>
            <SelectValue placeholder={t("myMods.groups.destination")} />
          </SelectTrigger>
          <SelectContent>
            {Object.values(profiles)
              .filter((profile) => profile.id !== sourceId)
              .map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>
                  {profile.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        {target && (
          <p className='text-sm text-muted-foreground'>
            {t("myMods.groups.copyReplace", { name: target.name })}
          </p>
        )}
        <DialogFooter>
          <Button variant='ghost' onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!target || target.id === sourceId}
            onClick={() => {
              if (target && copy(sourceId, target.id)) {
                toast.success(t("myMods.groups.copied", { name: target.name }));
                onOpenChange(false);
              }
            }}>
            {t("myMods.groups.copyAction")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
