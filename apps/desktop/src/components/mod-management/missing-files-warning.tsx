import { Badge } from "@deadlock-mods/ui/components/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { TriangleAlert } from "@deadlock-mods/ui/icons";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { useTranslation } from "react-i18next";

/**
 * Marks a mod some of whose VPKs were deleted outside the mod manager. It
 * stays in the library so the user can reinstall or delete it.
 */
export const MissingFilesWarning = ({
  missingVpks,
  className,
}: {
  missingVpks: readonly string[] | undefined;
  className?: string;
}) => {
  const { t } = useTranslation();
  if (!missingVpks?.length) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          className={cn(
            "cursor-help border-destructive/50 bg-background/80 text-red-300 backdrop-blur-sm",
            className,
          )}
          data-testid='missing-files-warning'
          variant='outline'>
          <TriangleAlert aria-hidden />
          {t("warnings.missingFilesLabel")}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p className='max-w-xs'>
          {t("warnings.missingFilesDescription", {
            count: missingVpks.length,
            files: missingVpks.join(", "),
          })}
        </p>
      </TooltipContent>
    </Tooltip>
  );
};
