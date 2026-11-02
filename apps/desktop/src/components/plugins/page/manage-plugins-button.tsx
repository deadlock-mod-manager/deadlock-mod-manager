import { PuzzlePieceIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { PageButton } from "./page-button";

export const ManagePluginsButton = ({ path }: { path: string }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <PageButton onClick={() => navigate(path)} variant='ghost'>
      <PuzzlePieceIcon />
      {t("plugins.page.managePlugins")}
    </PageButton>
  );
};
