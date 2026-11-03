import { useTranslation } from "react-i18next";
import { CubeIcon } from "@phosphor-icons/react";
import { useLocalModThumbnail } from "@/hooks/use-local-mod-thumbnail";
import type { LocalMod } from "@/types/mods";

export const VisibleLocalModThumbnail = ({ mod }: { mod: LocalMod }) => {
  const { t } = useTranslation();
  const thumbnail = useLocalModThumbnail(mod);
  if (thumbnail.data)
    return (
      <img
        src={thumbnail.data}
        alt={t("modPreview.generatedThumbnail", { name: mod.name })}
        className='h-full w-full object-contain'
        decoding='async'
      />
    );
  return (
    <div
      className='flex h-full flex-col items-center justify-center gap-1 px-2 text-center text-muted-foreground'
      role='img'
      aria-label={t("modPreview.noThumbnail")}>
      <CubeIcon className='size-6 opacity-50' weight='duotone' />
      <span className='text-xs'>
        {t(
          thumbnail.isFetching
            ? "modPreview.generatingThumbnail"
            : "modPreview.noThumbnail",
        )}
      </span>
    </div>
  );
};
