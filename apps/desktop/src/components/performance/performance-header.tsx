import { Button } from "@deadlock-mods/ui/components/button";
import { DownloadSimpleIcon, PowerIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import PageTitle from "@/components/shared/page-title";
import { useRemovePerfConfig } from "@/hooks/performance/use-perf-mutations";
import { usePerfStatus } from "@/hooks/performance/use-perf-queries";
import { ExportConfigButton } from "./export/export-config-button";
import { usePerformanceUi } from "./performance-context";

export const PerformanceHeader = () => {
  const { t } = useTranslation();
  const { openImport } = usePerformanceUi();
  const confirm = useConfirm();
  const { data: status } = usePerfStatus();
  const removeMutation = useRemovePerfConfig();
  const desired = status?.desired ?? null;

  const handleTurnOff = async () => {
    if (!desired) return;
    const confirmed = await confirm({
      title: t("performance.header.turnOffConfirm.title", {
        name: desired.request.name,
      }),
      body: t("performance.header.turnOffConfirm.body"),
      actionButton: t("performance.header.turnOff"),
      tone: "destructive",
      icon: PowerIcon,
    });
    if (confirmed) removeMutation.mutate({ entryPoint: "page" });
  };

  return (
    <div className='mb-6 flex flex-wrap items-start justify-between gap-3'>
      <PageTitle
        className='max-w-3xl'
        subtitle={t("performance.subtitle")}
        title={t("performance.title")}
      />
      <div className='flex flex-wrap items-center gap-2 pt-4'>
        <Button
          icon={<DownloadSimpleIcon aria-hidden />}
          onClick={() => openImport()}
          variant='outline'>
          {t("performance.header.import")}
        </Button>
        <ExportConfigButton />
        <Button
          disabled={!desired}
          icon={<PowerIcon aria-hidden />}
          isLoading={removeMutation.isPending}
          onClick={handleTurnOff}
          variant='outline'>
          {t("performance.header.turnOff")}
        </Button>
      </div>
    </div>
  );
};
