import { Alert, AlertDescription } from "@deadlock-mods/ui/components/alert";
import { AlertTriangle } from "@deadlock-mods/ui/icons";

type OutdatedModWarningProps = {
  variant?: "indicator" | "alert";
  className?: string;
};

export const OutdatedModWarning = ({
  variant = "indicator",
  className,
}: OutdatedModWarningProps) => {
  const warningText =
    "This mod hasn't been updated since the Old Gods, New Blood update and may not work properly";

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
