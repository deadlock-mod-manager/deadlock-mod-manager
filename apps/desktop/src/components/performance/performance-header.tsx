import { Button } from "@deadlock-mods/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { ArrowsClockwiseIcon, DownloadSimpleIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import PageTitle from "@/components/shared/page-title";
import { useRefreshPerfCatalog } from "@/hooks/performance/use-perf-mutations";
import { usePerfCatalog } from "@/hooks/performance/use-perf-queries";
import { ExportConfigButton } from "./export/export-config-button";
import { usePerformanceUi } from "./performance-context";

const RefreshCatalogButton = () => {
  const { t } = useTranslation();
  const { data: catalog } = usePerfCatalog();
  const refreshMutation = useRefreshPerfCatalog();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={t("performance.header.refreshCatalog")}
          className='text-muted-foreground'
          icon={<ArrowsClockwiseIcon aria-hidden />}
          isLoading={refreshMutation.isPending}
          onClick={() => refreshMutation.mutate()}
          size='icon'
          variant='ghost'
        />
      </TooltipTrigger>
      <TooltipContent>
        <p>{t("performance.header.refreshCatalog")}</p>
        {catalog && (
          <p className='text-white/60'>
            {t("performance.header.catalogVersion", {
              version: catalog.version,
            })}
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
};

export const PerformanceHeader = () => {
  const { t } = useTranslation();
  const { openImport } = usePerformanceUi();

  return (
    <div className='mb-6 flex items-start justify-between gap-6'>
      <PageTitle
        className='min-w-0 max-w-2xl'
        subtitle={t("performance.subtitle")}
        title={t("performance.title")}
      />
      <div className='flex shrink-0 items-center gap-2 pt-5'>
        <RefreshCatalogButton />
        <Button
          icon={<DownloadSimpleIcon aria-hidden />}
          onClick={() => openImport()}
          variant='outline'>
          {t("performance.header.import")}
        </Button>
        <ExportConfigButton />
      </div>
    </div>
  );
};
