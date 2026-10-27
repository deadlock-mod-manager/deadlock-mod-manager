import { Button } from "@deadlock-mods/ui/components/button";
import { useTranslation } from "react-i18next";
import type { planParticleColors } from "@/lib/particle-colors";

export function ParticleColorProposal({
  before,
  hex,
  all,
  plan,
  busy,
  invalid,
  onApply,
  onDiscard,
}: {
  before?: string;
  hex: string;
  all: boolean;
  plan: ReturnType<typeof planParticleColors>;
  busy: boolean;
  invalid: boolean;
  onApply: () => void;
  onDiscard: () => void;
}) {
  const { t } = useTranslation();
  return (
    <section
      className='shrink-0 space-y-2 border-t border-primary/30 bg-primary/5 p-3'
      aria-label={t("particleColors.proposal")}>
      <div className='flex items-center gap-2 text-xs font-medium'>
        {before && !all ? (
          <>
            <span
              className='size-5 rounded border'
              style={{ backgroundColor: before }}
            />
            <span className='font-mono'>{before}</span>
            <span aria-hidden='true'>→</span>
          </>
        ) : null}
        <span
          className='size-5 rounded border'
          style={{ backgroundColor: hex }}
        />
        <span className='font-mono'>{hex}</span>
      </div>
      <p className='text-xs font-medium'>
        {t("particleColors.proposalScope", {
          count: plan.files.length,
          fields: plan.fields,
        })}
      </p>
      <details className='text-xs text-muted-foreground'>
        <summary className='cursor-pointer'>
          {t("particleColors.showAffectedFiles")}
        </summary>
        <ul className='mt-2 max-h-28 overflow-auto'>
          {plan.files.map((path) => (
            <li key={path} className='break-all font-mono'>
              {path}
            </li>
          ))}
        </ul>
      </details>
      {invalid ? (
        <p role='alert' className='text-xs text-destructive'>
          {t("particleColors.invalidSelection")}
        </p>
      ) : null}
      <div className='flex gap-2'>
        <Button
          size='sm'
          variant='ghost'
          disabled={busy}
          aria-label={t("particleColors.discardProposal")}
          onClick={onDiscard}>
          {t("common.cancel")}
        </Button>
        <Button
          size='sm'
          className='flex-1'
          disabled={busy || invalid}
          onClick={onApply}>
          {t("particleColors.applyDraft", { count: plan.files.length })}
        </Button>
      </div>
    </section>
  );
}
