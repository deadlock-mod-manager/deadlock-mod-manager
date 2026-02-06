import { Alert, AlertDescription } from "@deadlock-mods/ui/components/alert";
import { Badge } from "@deadlock-mods/ui/components/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { XCircle } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";

type ObsoleteModWarningProps = {
  variant?: "indicator" | "alert";
  className?: string;
};

export const ObsoleteModWarning = ({
  variant = "indicator",
  className,
}: ObsoleteModWarningProps) => {
  const { t } = useTranslation();
  const warningText = t("warnings.obsoleteDescription");

  if (variant === "alert") {
    return (
      <Alert className={className} variant='destructive'>
        <XCircle className='h-4 w-4' />
        <AlertDescription>{warningText}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge className={`cursor-help ${className}`} variant='destructive'>
          <XCircle className='mr-1 h-3 w-3' />
          {t("warnings.obsoleteLabel")}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p className='max-w-xs'>{warningText}</p>
      </TooltipContent>
    </Tooltip>
  );
};
