import { Badge } from "@deadlock-mods/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { Flag } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { useReportCounts } from "@/hooks/use-report-counts";
import { cn } from "@/lib/utils";
import { ReportTypesList } from "./report-types-list";

interface ReportCounterProps {
  modId: string;
  variant?: "default" | "compact" | "indicator";
  showUnverified?: boolean;
}

export const ReportCounter = ({
  modId,
  variant = "compact",
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
            <Flag className='h-3 w-3 mr-1' />
            {hasVerifiedReports ? counts.verified : counts.unverified}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <div className='text-sm space-y-2'>
            <div>{t("reports.totalReports", { count: counts.total })}</div>
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
            <ReportTypesList
              reportTypes={counts.byType || {}}
              variant='compact'
            />
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (variant === "compact") {
    return (
      <div className='flex items-center gap-1 text-muted-foreground'>
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
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2 text-xl'>
          <Flag className='h-4 w-4' />
          <span>{t("reports.title")}</span>
        </CardTitle>
        <CardDescription>
          {t("reports.description", { count: counts.total })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ReportTypesList reportTypes={counts.byType || {}} />
      </CardContent>
    </Card>
  );
};
