import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { Users } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { CopyableCommand } from "@/components/shared/copyable-command";

interface InviteFriendsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectCode: string;
}

export const InviteFriendsDialog = ({
  open,
  onOpenChange,
  connectCode,
}: InviteFriendsDialogProps) => {
  const { t } = useTranslation();

  const connectCommand = `connect ${connectCode}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <div className='flex items-center gap-3'>
            <div className='flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15'>
              <Users className='h-5 w-5 text-primary' />
            </div>
            <div>
              <DialogTitle>{t("mapInvite.title")}</DialogTitle>
              <DialogDescription>
                {t("mapInvite.description")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className='space-y-4 py-2'>
          <p className='text-sm text-muted-foreground'>
            {t("mapInvite.instructions")}
          </p>

          <CopyableCommand command={connectCommand} />

          <div className='rounded-lg border border-border/50 bg-muted/30 p-3'>
            <p className='text-xs text-muted-foreground'>
              {t("mapInvite.friendSteps")}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            {t("mapInvite.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
