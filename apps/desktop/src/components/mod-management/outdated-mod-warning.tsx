import { Alert, AlertDescription } from "@deadlock-mods/ui/components/alert";
import { AlertTriangle } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";

type OutdatedModWarningProps = {
  variant?: "indicator" | "alert";
  className?: string;
};

export const OutdatedModWarning = ({
  variant = "indicator",
  className,
}: OutdatedModWarningProps) => {
  const { t } = useTranslation();
  const warningText = t("warnings.outdatedDescription");

  if (variant === "alert") {
    return (
      <Alert className={className} variant='warning'>
        <AlertTriangle className='h-4 w-4' />
        <AlertDescription>{warningText}</AlertDescription>
      </Alert>
    );
  }

  return null;
};
