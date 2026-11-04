import { Button } from "@deadlock-mods/ui/components/button";
import { FolderOpenIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

export const GameMissingStrip = ({
  reason,
}: {
  reason: "path" | "gameinfo";
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <section className='flex flex-wrap items-center gap-3 rounded-lg border p-3 pl-4'>
      <FolderOpenIcon
        aria-hidden
        className='size-5 shrink-0 text-muted-foreground'
      />
      <p className='min-w-0 flex-1 text-sm'>
        {reason === "path"
          ? t("performance.activeStatus.noGamePath")
          : t("performance.activeStatus.noGameinfo")}
      </p>
      <Button
        onClick={() => navigate("/settings", { state: { activeTab: "game" } })}
        size='sm'
        variant='outline'>
        {t("performance.activeStatus.openSettings")}
      </Button>
    </section>
  );
};
