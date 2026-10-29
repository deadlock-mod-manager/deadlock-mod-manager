import { cn } from "@deadlock-mods/ui/lib/utils";
import { CheckIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FoundryHeroAssembling } from "./foundry-assembling";
import { useOptionalFoundry } from "./foundry-context";
import { FoundryLoadingBar } from "./foundry-loading-bar";
import { loadSilhouette, type Silhouette } from "./foundry-silhouettes";

type StepState = "done" | "now";

const StepMark = ({ state }: { state: StepState }) =>
  state === "done" ? (
    <span className='flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-green-400/15'>
      <CheckIcon className='h-2.5 w-2.5 text-green-400' weight='bold' />
    </span>
  ) : (
    <span className='h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-orange-400 border-r-transparent' />
  );

const Step = ({
  state,
  label,
  detail,
}: {
  state: StepState;
  label: string;
  detail?: string;
}) => (
  <li className='flex items-center gap-[9px] text-xs'>
    <StepMark state={state} />
    <span
      className={cn(
        "min-w-0 flex-1 truncate",
        state === "now" && "font-semibold",
      )}>
      {label}
    </span>
    {detail && (
      <span className='shrink-0 font-mono text-[11px] text-muted-foreground'>
        {detail}
      </span>
    )}
  </li>
);

/** What opening the skin has done so far, from the Foundry's own state. */
const OpeningSteps = () => {
  const { t } = useTranslation();
  const foundry = useOptionalFoundry();
  if (!foundry?.manifest) return null;
  const { manifest, paintParts, workspace } = foundry;
  const hero = manifest.heroDisplay ?? manifest.hero ?? "";

  return (
    <ol
      aria-label={t("foundry.opening.label")}
      className='w-[300px] space-y-2 rounded-[10px] border bg-card/95 px-3.5 py-3'
      role='status'>
      <Step
        detail={t("foundry.opening.files", {
          count: manifest.entryCount,
          formattedCount: manifest.entryCount.toLocaleString(),
        })}
        label={t("foundry.opening.unpacked")}
        state='done'
      />
      {/* In the order they usually finish. They run side by side, so each one
          that is still going spins rather than waiting its turn. */}
      <Step
        label={t("foundry.opening.workspace")}
        state={workspace ? "done" : "now"}
      />
      <Step
        label={
          paintParts.length > 0
            ? t("foundry.opening.sections", { count: paintParts.length })
            : t("foundry.opening.findingSections")
        }
        state={paintParts.length > 0 ? "done" : "now"}
      />
      <Step label={t("foundry.opening.assembling", { hero })} state='now' />
    </ol>
  );
};

/**
 * The stage a model is about to stand on: embers that build a hero, and either
 * the steps of opening the skin or a single status line. It sits where the
 * model will land, so the model can fade in over it.
 */
export const ModelLoadingStage = ({
  status,
  className,
}: {
  status: string;
  className?: string;
}) => {
  const foundry = useOptionalFoundry();
  const steps = foundry?.manifest;
  const hero = foundry?.manifest
    ? (foundry.manifest.heroDisplay ?? foundry.manifest.hero)
    : null;
  // Undefined while the lookup runs, so a known hero never flashes the
  // generic figure first.
  const [silhouette, setSilhouette] = useState<Silhouette | null | undefined>(
    hero ? undefined : null,
  );
  useEffect(() => {
    if (!hero) {
      setSilhouette(null);
      return;
    }
    let cancelled = false;
    void loadSilhouette(hero).then((points) => {
      if (!cancelled) setSilhouette(points);
    });
    return () => {
      cancelled = true;
    };
  }, [hero]);

  return (
    <div className={cn("absolute inset-0 overflow-hidden", className)}>
      <div
        aria-hidden
        className='absolute bottom-[14%] left-1/2 h-16 w-[60%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,oklch(0.72_0.15_50/0.22),transparent)]'
      />
      {silhouette !== undefined && (
        <FoundryHeroAssembling
          className='absolute inset-x-0 top-[3%] bottom-[27%]'
          silhouette={silhouette}
        />
      )}
      <div className='absolute inset-x-0 bottom-0 flex flex-col items-center gap-2.5 p-6'>
        {steps ? (
          <OpeningSteps />
        ) : (
          <>
            <p className='text-muted-foreground text-xs' role='status'>
              {status}
            </p>
            <FoundryLoadingBar className='max-w-xs' />
          </>
        )}
      </div>
    </div>
  );
};
