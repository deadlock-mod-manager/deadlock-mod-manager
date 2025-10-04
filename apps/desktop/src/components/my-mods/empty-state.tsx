import { Button } from "@deadlock-mods/ui/components/button";
import { Package, Search } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { AnalyzeAddonsButton } from "./analyze-addons-button";

export const MyModsEmptyState = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const handleVisitModsPage = () => {
    navigate("/mods");
  };

  return (
    <div className='flex h-[calc(100vh-300px)] flex-col items-center justify-center text-muted-foreground'>
      <Package className='mb-4 h-16 w-16' />
      <h3 className='mb-2 font-medium text-xl'>{t("myMods.noModsTitle")}</h3>
      <p className='mb-6 text-center text-sm max-w-md'>
        {t("myMods.noModsDescription")}
      </p>
      <div className='flex gap-3'>
        <Button onClick={handleVisitModsPage} variant='default'>
          <Search className='mr-2 h-4 w-4' />
          {t("myMods.visitModsPage")}
        </Button>
        <AnalyzeAddonsButton />
      </div>
    </div>
  );
};
