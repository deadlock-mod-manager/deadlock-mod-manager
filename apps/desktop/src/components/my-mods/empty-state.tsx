import { Button } from "@deadlock-mods/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
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
    <Empty className='h-[calc(100vh-300px)]'>
      <EmptyHeader>
        <EmptyMedia variant='default'>
          <Package className='h-16 w-16' />
        </EmptyMedia>
        <EmptyTitle>{t("myMods.noModsTitle")}</EmptyTitle>
        <EmptyDescription>{t("myMods.noModsDescription")}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div className='flex gap-3'>
          <Button
            onClick={handleVisitModsPage}
            variant='default'
            icon={<Search className='h-4 w-4' />}>
            {t("myMods.visitModsPage")}
          </Button>
          <AnalyzeAddonsButton size='default' className='text-white' />
        </div>
      </EmptyContent>
    </Empty>
  );
};
