import { toast } from "@deadlock-mods/ui/components/sonner";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FoundryEmptyState } from "@/components/foundry/foundry-empty-state";
import { useFoundry } from "@/components/foundry/foundry-context";
import { FoundryShell } from "@/components/foundry/foundry-shell";

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

const Foundry = () => (
  <div className='flex h-full w-full flex-col overflow-hidden px-7 pt-6 pb-4'>
    <FoundryWorkspace />
  </div>
);

export default Foundry;
