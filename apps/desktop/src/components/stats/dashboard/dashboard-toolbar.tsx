import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@deadlock-mods/ui/components/alert-dialog";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Check,
  Plus,
  RotateCcw,
  TriangleAlert,
  X,
} from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}

export const ConfirmDialog = ({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onOpenChange,
}: ConfirmDialogProps) => {
  const { t } = useTranslation();
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            onClick={onConfirm}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

interface EditToolbarProps {
  isDirty: boolean;
  onAddWidget: () => void;
  onReset: () => void;
  onCancel: () => void;
  onSave: () => void;
}

export const EditToolbar = ({
  isDirty,
  onAddWidget,
  onReset,
  onCancel,
  onSave,
}: EditToolbarProps) => {
  const { t } = useTranslation();
  return (
    <div className='flex flex-col gap-2 rounded-xl border border-primary/40 bg-primary/5 p-3'>
      <div className='flex flex-wrap items-center gap-2'>
        <div className='mr-auto min-w-0'>
          <p className='font-semibold text-sm'>
            {t("stats.dashboard.toolbar.title")}
          </p>
          <p className='text-muted-foreground text-xs'>
            {t("stats.dashboard.toolbar.hint")}
          </p>
        </div>
        <Button
          className='gap-1.5'
          data-testid='stats-add-widget'
          onClick={onAddWidget}
          size='sm'>
          <Plus className='h-4 w-4' />
          {t("stats.dashboard.addWidget")}
        </Button>
        <Button
          className='gap-1.5'
          data-testid='stats-reset'
          onClick={onReset}
          size='sm'
          variant='outline'>
          <RotateCcw className='h-4 w-4' />
          {t("stats.dashboard.toolbar.reset")}
        </Button>
        <Button
          className='gap-1.5'
          data-testid='stats-cancel'
          onClick={onCancel}
          size='sm'
          variant='ghost'>
          <X className='h-4 w-4' />
          {t("stats.dashboard.toolbar.cancel")}
        </Button>
        <Button
          className='gap-1.5'
          data-testid='stats-save'
          disabled={!isDirty}
          onClick={onSave}
          size='sm'
          variant='default'>
          <Check className='h-4 w-4' />
          {t("stats.dashboard.toolbar.save")}
        </Button>
      </div>
      <p className='flex items-start gap-2 text-muted-foreground text-xs leading-relaxed'>
        <TriangleAlert className='mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500' />
        {t("stats.dashboard.apiWarning")}
      </p>
    </div>
  );
};
