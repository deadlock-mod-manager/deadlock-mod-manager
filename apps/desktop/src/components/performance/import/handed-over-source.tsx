import { type ImportModContext } from "@/lib/performance/import/save";
import type { ImportSource } from "@/types/generated/ImportSource";
import { ArchiveIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { GameBananaHandedOverSource } from "./game-banana-handed-over-source";

export const HandedOverSource = ({
  source,
  context,
  onChangeSource,
}: {
  source: ImportSource;
  context: ImportModContext | null;
  onChangeSource: () => void;
}) => {
  const { t } = useTranslation();
  if (source.kind === "gameBanana") {
    return (
      <GameBananaHandedOverSource
        fileId={source.file_id}
        modId={source.mod_id}
        onChangeSource={onChangeSource}
      />
    );
  }
  const title = context
    ? t("performance.import.handedOver.modDownload", {
        modName: context.modName,
      })
    : t("performance.import.handedOver.archive");
  return (
    <div className='flex items-start gap-3 rounded-md border bg-card/40 px-3 py-2.5'>
      <ArchiveIcon className='mt-0.5 size-4 shrink-0 text-muted-foreground' />
      <div className='flex min-w-0 flex-1 flex-col gap-1'>
        <span className='font-medium text-sm'>{title}</span>
        <button
          className='self-start text-primary text-xs hover:underline'
          onClick={onChangeSource}
          type='button'>
          {t("performance.import.handedOver.changeSource")}
        </button>
      </div>
    </div>
  );
};
