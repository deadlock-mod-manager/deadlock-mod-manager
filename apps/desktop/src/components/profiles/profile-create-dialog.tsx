import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAnalyticsContext } from "@/contexts/analytics-context";
import { usePersistedStore } from "@/lib/store";

interface ProfileCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ProfileCreateDialog = ({
  open,
  onOpenChange,
}: ProfileCreateDialogProps) => {
  const { t } = useTranslation();
  const { analytics } = useAnalyticsContext();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const { createProfile, getAllProfiles } = usePersistedStore();

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error(t("profiles.nameRequired"));
      return;
    }

    const existingProfiles = getAllProfiles();
    if (
      existingProfiles.some(
        (p) => p.name.toLowerCase() === name.trim().toLowerCase(),
      )
    ) {
      toast.error(t("profiles.nameAlreadyExists"));
      return;
    }

    setIsCreating(true);

    try {
      const profileId = createProfile(
        name.trim(),
        description.trim() || undefined,
      );

      if (profileId) {
        analytics.trackProfileCreated(profileId, 0);

        toast.success(
          t("profiles.createSuccess", { profileName: name.trim() }),
        );
        setName("");
        setDescription("");
        onOpenChange(false);
      } else {
        toast.error(t("profiles.createError"));
      }
    } catch (error) {
      toast.error(t("profiles.createError"));
    } finally {
      setIsCreating(false);
    }
  };

  const handleCancel = () => {
    setName("");
    setDescription("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-[425px]'>
        <DialogHeader>
          <DialogTitle>{t("profiles.createNew")}</DialogTitle>
          <DialogDescription>
            {t("profiles.createDescription")}
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
              disabled={isCreating}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) {
                  handleCreate();
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
              disabled={isCreating}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant='outline'
            onClick={handleCancel}
            disabled={isCreating}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim() || isCreating}>
            {isCreating ? t("profiles.creating") : t("profiles.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
