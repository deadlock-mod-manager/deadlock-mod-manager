import { useTranslation } from "react-i18next";
import type { FoundryModel } from "@/types/foundry";
import type { ParticleDiagnostic } from "@/lib/particles/types";
import type { PreviewParticleDiagnostic } from "@/types/generated/PreviewParticleDiagnostic";
import { CopyPreviewDetails } from "./copy-preview-details";

interface Props {
  model: FoundryModel;
  animationFailed?: boolean;
  effectsLimited?: boolean;
  effectDiagnostics?: readonly (
    | ParticleDiagnostic
    | PreviewParticleDiagnostic
  )[];
}

/** Keep the usable model on screen; technical evidence is available only on demand. */
export const PreviewDiagnostics = ({
  model,
  animationFailed,
  effectsLimited,
  effectDiagnostics,
}: Props) => {
  const { t } = useTranslation();
  const issues = model.report?.issues ?? [];
  if (issues.length === 0 && !animationFailed && !effectsLimited) return null;
  const kinds = [...new Set(issues.map((issue) => issue.kind))];
  return (
    <details className='absolute top-14 left-3 z-10 max-w-[min(20rem,calc(100%-2rem))] rounded-md border bg-background/90 px-2.5 py-1.5 text-xs backdrop-blur'>
      <summary className='cursor-pointer text-muted-foreground' role='status'>
        {t("modPreview.partial")}
      </summary>
      <div className='max-h-40 space-y-2 overflow-y-auto pt-2'>
        {animationFailed && <p>{t("modPreview.issues.animation")}</p>}
        {effectsLimited && <p>{t("modPreview.issues.effects")}</p>}
        {kinds.map((kind) => (
          <p key={kind}>{t(`modPreview.issues.${kind}`)}</p>
        ))}
        <CopyPreviewDetails
          details={JSON.stringify(
            {
              model: model.report,
              animationFailed,
              effectsLimited,
              effects: effectDiagnostics,
            },
            null,
            2,
          )}
        />
      </div>
    </details>
  );
};
