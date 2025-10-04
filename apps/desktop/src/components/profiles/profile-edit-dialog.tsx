import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { Input } from "@deadlock-mods/ui/components/input";
import { Label } from "@deadlock-mods/ui/components/label";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { Textarea } from "@deadlock-mods/ui/components/textarea";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePersistedStore } from "@/lib/store";
import type { ProfileId } from "@/types/profiles";

interface ProfileEditDialogProps {
  profileId: ProfileId;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ProfileEditDialog = ({
  profileId,
  open,
  onOpenChange,
}: ProfileEditDialogProps) => {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const { getProfile, updateProfile, getAllProfiles } = usePersistedStore();
  const profile = getProfile(profileId);

  useEffect(() => {
    if (profile) {
      setName(profile.name);
      setDescription(profile.description || "");
    }
  }, [profile]);

  const handleUpdate = async () => {
    if (!name.trim()) {
      toast.error(t("profiles.nameRequired"));
      return;
    }

    const existingProfiles = getAllProfiles();
    if (
      existingProfiles.some(
        (p) =>
          p.id !== profileId &&
          p.name.toLowerCase() === name.trim().toLowerCase(),
      )
    ) {
      toast.error(t("profiles.nameAlreadyExists"));
      return;
    }

    setIsUpdating(true);

    try {
      const success = updateProfile(profileId, {
        name: name.trim(),
        description: description.trim() || undefined,
      });

      if (success) {
        toast.success(
          t("profiles.updateSuccess", { profileName: name.trim() }),
        );
        onOpenChange(false);
      } else {
        toast.error(t("profiles.updateError"));
      }
    } catch (error) {
      toast.error(t("profiles.updateError"));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCancel = () => {
    if (profile) {
      setName(profile.name);
      setDescription(profile.description || "");
    }
    onOpenChange(false);
  };

  if (!profile) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-[425px]'>
        <DialogHeader>
          <DialogTitle>{t("profiles.editProfile")}</DialogTitle>
          <DialogDescription>
            {t("profiles.editDescription", { profileName: profile.name })}
          </DialogDescription>
        </DialogHeader>

        <div className='flex flex-col gap-4'>
          <div className='flex flex-col gap-4'>
            <Label htmlFor='profile-name'>{t("profiles.name")}</Label>
            <Input
              id='profile-name'
              value={name}
              onChange={(e) => setName(e.target.value)}
              className='col-span-3'
              placeholder={t("profiles.namePlaceholder")}
              maxLength={50}
              disabled={isUpdating || profile.isDefault}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) {
                  handleUpdate();
                }
              }}
            />
          </div>

          <div className='flex flex-col gap-4'>
            <Label htmlFor='profile-description'>
              {t("profiles.description")}
            </Label>
            <Textarea
              id='profile-description'
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className='col-span-3'
              placeholder={t("profiles.descriptionPlaceholder")}
              maxLength={200}
              rows={3}
              disabled={isUpdating}
            />
          </div>

          {profile.isDefault && (
            <p className='text-sm text-muted-foreground col-span-4 text-center'>
              {t("profiles.defaultProfileEditLimitation")}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant='outline'
            onClick={handleCancel}
            disabled={isUpdating}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleUpdate}
            disabled={!name.trim() || isUpdating || profile.isDefault}>
            {isUpdating ? t("profiles.updating") : t("profiles.update")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
