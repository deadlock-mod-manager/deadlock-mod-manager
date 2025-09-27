import { AlertTriangle, Flag } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useReportCounts } from "@/hooks/use-report-counts";
import { cn } from "@/lib/utils";

interface ReportCounterProps {
  modId: string;
  variant?: "default" | "compact" | "indicator";
  showUnverified?: boolean;
}

export const ReportCounter = ({
  modId,
  variant = "default",
  showUnverified = true,
}: ReportCounterProps) => {
  const { t } = useTranslation();
  const { data: counts, isLoading } = useReportCounts(modId);

  if (isLoading || !counts || counts.total === 0) {
    return null;
  }

  const hasVerifiedReports = counts.verified > 0;
  const hasUnverifiedReports = counts.unverified > 0;

  if (variant === "indicator") {
    if (!hasVerifiedReports && (!showUnverified || !hasUnverifiedReports)) {
      return null;
    }

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant={hasVerifiedReports ? "destructive" : "secondary"}
            className={cn(
              "h-5 rounded-full text-xs",
              hasVerifiedReports && "animate-pulse",
            )}>
            <AlertTriangle className='h-3 w-3 mr-1' />
            {hasVerifiedReports ? counts.verified : counts.unverified}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <div className='text-sm'>
            {hasVerifiedReports && (
              <p className='text-destructive font-medium'>
                {t("reports.verifiedReports", { count: counts.verified })}
              </p>
            )}
            {showUnverified && hasUnverifiedReports && (
              <p className='text-muted-foreground'>
                {t("reports.unverifiedReports", { count: counts.unverified })}
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (variant === "compact") {
    return (
      <div className='flex items-center gap-1 text-xs text-muted-foreground'>
        <Flag className='h-3 w-3' />
        <span>{counts.total}</span>
        {hasVerifiedReports && (
          <span className='text-destructive font-medium'>
            ({counts.verified} {t("reports.verified")})
          </span>
        )}
      </div>
    );
  }

  return (
    <div className='flex items-center gap-2 text-sm'>
      <div className='flex items-center gap-1 text-muted-foreground'>
        <Flag className='h-4 w-4' />
        <span>{t("reports.totalReports", { count: counts.total })}</span>
      </div>

      {hasVerifiedReports && (
        <Badge variant='destructive' className='text-xs'>
          {t("reports.verifiedCount", { count: counts.verified })}
        </Badge>
      )}

      {showUnverified && hasUnverifiedReports && (
        <Badge variant='secondary' className='text-xs'>
          {t("reports.unverifiedCount", { count: counts.unverified })}
        </Badge>
      )}
    </div>
  );
};
