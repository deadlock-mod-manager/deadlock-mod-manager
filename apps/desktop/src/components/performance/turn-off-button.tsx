import { useConfirm } from "@/components/providers/alert-dialog";
import { useRemovePerfConfig } from "@/hooks/performance/use-perf-mutations";
import { Button } from "@deadlock-mods/ui/components/button";
import { PowerIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

export const TurnOffButton = ({ name }: { name: string }) => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const removeMutation = useRemovePerfConfig();

  const turnOff = async () => {
    const confirmed = await confirm({
      title: t("performance.header.turnOffConfirm.title", { name }),
      body: t("performance.header.turnOffConfirm.body"),
      actionButton: t("performance.header.turnOff"),
      tone: "destructive",
      icon: PowerIcon,
    });
    if (confirmed) removeMutation.mutate({ entryPoint: "page" });
  };

  return (
    <Button
      icon={<PowerIcon aria-hidden />}
      isLoading={removeMutation.isPending}
      onClick={turnOff}
      size='sm'
      variant='ghost'>
      {t("performance.header.turnOff")}
    </Button>
  );
};
