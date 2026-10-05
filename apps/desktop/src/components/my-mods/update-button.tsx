import { Button, type ButtonProps } from "@deadlock-mods/ui/components/button";
import { Loader2, RefreshCw } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";

interface UpdateButtonProps extends Omit<ButtonProps, "icon"> {
  updatePercent: number | undefined;
}

export const UpdateButton = ({
  updatePercent,
  children,
  ...props
}: UpdateButtonProps) => {
  const { t } = useTranslation();
  const isUpdating = updatePercent !== undefined;

  return (
    <Button
      {...props}
      icon={
        isUpdating ? (
          <Loader2 className='h-4 w-4 animate-spin' />
        ) : (
          <RefreshCw className='h-4 w-4' />
        )
      }>
      {isUpdating
        ? t("myMods.batchUpdate.updatingPercent", { percent: updatePercent })
        : children}
    </Button>
  );
};
