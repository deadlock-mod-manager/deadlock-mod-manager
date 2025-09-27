import { AlertTriangle, Bug, Clock, HelpCircle, Shield } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";

interface ReportTypeCounts {
  total: number;
  verified: number;
  unverified: number;
  dismissed: number;
}

interface ReportTypesListProps {
  reportTypes: Record<string, ReportTypeCounts>;
  className?: string;
  variant?: "default" | "compact";
}

const getReportTypeIcon = (type: string) => {
  switch (type) {
    case "broken":
      return <Bug className='h-3 w-3' />;
    case "outdated":
      return <Clock className='h-3 w-3' />;
    case "malicious":
      return <Shield className='h-3 w-3' />;
    case "inappropriate":
      return <AlertTriangle className='h-3 w-3' />;
    case "other":
      return <HelpCircle className='h-3 w-3' />;
    default:
      return <HelpCircle className='h-3 w-3' />;
  }
};

const getReportTypeColor = (type: string) => {
  switch (type) {
    case "broken":
      return "text-red-500";
    case "outdated":
      return "text-yellow-500";
    case "malicious":
      return "text-red-600";
    case "inappropriate":
      return "text-orange-500";
    case "other":
      return "text-gray-500";
    default:
      return "text-gray-500";
  }
};

export const ReportTypesList = ({
  reportTypes,
  className,
  variant = "default",
}: ReportTypesListProps) => {
  const { t } = useTranslation();

  if (!reportTypes || Object.keys(reportTypes).length === 0) {
    return null;
  }

  const sortedTypes = Object.entries(reportTypes)
    .filter(([, typeCounts]) => typeCounts.total > 0)
    .sort(([, a], [, b]) => b.total - a.total);

  if (sortedTypes.length === 0) {
    return null;
  }

  if (variant === "compact") {
    return (
      <div className={`flex flex-wrap gap-1 ${className || ""}`}>
        {sortedTypes.map(([type, typeCounts]) => (
          <Badge
            key={type}
            variant={typeCounts.verified > 0 ? "destructive" : "secondary"}
            className='flex items-center gap-1'>
            <span className={getReportTypeColor(type)}>
              {getReportTypeIcon(type)}
            </span>
            {typeCounts.total}
          </Badge>
        ))}
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className || ""}`}>
      {sortedTypes.map(([type, typeCounts]) => (
        <div
          key={type}
          className='flex items-center justify-between gap-3 py-1'>
          <div className='flex items-center gap-2 min-w-0 flex-1'>
            <span className={getReportTypeColor(type)}>
              {getReportTypeIcon(type)}
            </span>
            <span className='text-foreground truncate'>
              {t(`reports.types.${type}`)}
            </span>
          </div>
          <div className='flex items-center gap-2 flex-shrink-0'>
            <Badge variant='outline' className='font-medium'>
              {typeCounts.total}
            </Badge>
            {typeCounts.verified > 0 && (
              <Badge variant='destructive' className='text-xs'>
                {typeCounts.verified} {t("reports.verified")}
              </Badge>
            )}
            {typeCounts.unverified > 0 && (
              <Badge variant='secondary' className='text-xs'>
                {typeCounts.unverified} {t("reports.unverified")}
              </Badge>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
