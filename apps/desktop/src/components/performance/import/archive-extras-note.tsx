import { useTranslation } from "react-i18next";
import { describeArchiveExtras } from "@/lib/performance/import/review";
import type { ImportVariant } from "@/types/generated/ImportVariant";

/** What else an archive holds besides the versions offered for import. */
export const ArchiveExtrasNote = ({
  variants,
}: {
  variants: ImportVariant[];
}) => {
  const { t } = useTranslation();
  const { duplicates, hasVideoTxt } = describeArchiveExtras(variants);
  if (duplicates === 0 && !hasVideoTxt) return null;
  const key =
    duplicates > 0 && hasVideoTxt
      ? "copiesAndVideo"
      : duplicates > 0
        ? "copies"
        : "video";
  return (
    <p className='text-muted-foreground text-xs'>
      {t(`performance.import.variants.extras.${key}`, { count: duplicates })}
    </p>
  );
};
