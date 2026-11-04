import type { ForeignOverlay } from "@/types/generated/ForeignOverlay";
import { GaugeIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { OpenInEditorButton } from "./open-in-editor-button";
import { UndoButton } from "./undo-button";

export const EmptyStrip = ({ foreign }: { foreign: ForeignOverlay[] }) => {
  const { t } = useTranslation();
  return (
    <section
      aria-label={t("performance.activeStatus.label")}
      className='flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-3 pl-4'>
      <GaugeIcon
        aria-hidden
        className='size-5 shrink-0 text-muted-foreground'
      />
      <div className='min-w-0 flex-1 text-sm'>
        <p>{t("performance.activeStatus.none")}</p>
        {foreign.map((overlay) => (
          <p
            className='text-muted-foreground text-xs'
            key={`${overlay.tool}-${overlay.label ?? ""}`}>
            {t("performance.activeStatus.foreignOnly", {
              tool: t(`performance.foreignTools.${overlay.tool}`),
            })}
          </p>
        ))}
      </div>
      <OpenInEditorButton />
      <UndoButton currentConfigId={null} />
    </section>
  );
};
