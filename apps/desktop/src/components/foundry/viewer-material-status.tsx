import { useTranslation } from "react-i18next";
import { overlaySurface } from "./viewer-tool-types";

export function ViewerMaterialStatus({
  diagnostics,
}: {
  diagnostics: string[];
}) {
  const { t } = useTranslation();
  if (diagnostics.length === 0) return null;
  return (
    <details
      className={`${overlaySurface} max-w-72 rounded-md px-2 py-1 text-[11px]`}>
      <summary className='cursor-pointer text-amber-400'>
        {t("modelPreview.materialEffectsLimited", {
          count: diagnostics.length,
        })}
      </summary>
      <p className='pt-2 text-muted-foreground'>
        {t("modelPreview.materialEffectsHint")}
      </p>
      <ul className='max-h-36 space-y-1 overflow-y-auto pt-2 text-muted-foreground'>
        {diagnostics.slice(0, 32).map((diagnostic) => (
          <li key={diagnostic} className='break-words'>
            {diagnostic}
          </li>
        ))}
      </ul>
    </details>
  );
}
