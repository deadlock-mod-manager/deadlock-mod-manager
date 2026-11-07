import { Button } from "@deadlock-mods/ui/components/button";
import { ExternalLink } from "@deadlock-mods/ui/icons";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import { UPDATE_ROLLBACK_DOCS_URL } from "@/lib/constants";

type UpdateChannelNotesProps = {
  id: string;
  windows: boolean;
};

export const UpdateChannelNotes = ({
  id,
  windows,
}: UpdateChannelNotesProps) => {
  const { t } = useTranslation();

  return (
    <div className='space-y-1'>
      <p className='text-muted-foreground text-xs' id={id}>
        {t("settings.updateChannelNightlyNote")}
        {windows && ` ${t("settings.updateChannelNightlyWindowsNote")}`}
      </p>
      <Button
        className='h-auto gap-1.5 px-0 text-muted-foreground text-xs hover:text-foreground'
        onClick={() => void openUrl(UPDATE_ROLLBACK_DOCS_URL)}
        variant='link'>
        {t("settings.updateChannelRollbackGuide")}
        <ExternalLink aria-hidden className='size-3' />
      </Button>
    </div>
  );
};
