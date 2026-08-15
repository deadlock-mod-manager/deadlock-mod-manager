import { toast } from "@deadlock-mods/ui/components/sonner";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FoundryEmptyState } from "@/components/foundry/foundry-empty-state";
import { useFoundry } from "@/components/foundry/foundry-context";
import { FoundryShell } from "@/components/foundry/foundry-shell";
import PageTitle from "@/components/shared/page-title";

const FoundryWorkspace = () => {
  const { t } = useTranslation();
  const { status, error } = useFoundry();

  useEffect(() => {
    if (status !== "error" || !error) return;
    if (error === "notHeroSkin") {
      toast.error(t("foundry.errors.notHeroSkinTitle"), {
        description: t("foundry.errors.notHeroSkinDescription"),
      });
    } else {
      toast.error(t("foundry.errors.analyzeFailedTitle"), {
        description: t("foundry.errors.analyzeFailedDescription"),
      });
    }
  }, [status, error, t]);

  if (status === "ready") {
    return <FoundryShell />;
  }
  return <FoundryEmptyState />;
};

const Foundry = () => {
  const { t } = useTranslation();

  return (
    <div className='flex h-full w-full flex-col overflow-hidden pl-4 pr-2 pb-3'>
      <div className='mb-4 shrink-0'>
        <PageTitle
          subtitle={t("foundry.subtitle")}
          title={t("foundry.title")}
        />
      </div>
      <div className='min-h-0 flex-1'>
        <FoundryWorkspace />
      </div>
    </div>
  );
};

export default Foundry;
