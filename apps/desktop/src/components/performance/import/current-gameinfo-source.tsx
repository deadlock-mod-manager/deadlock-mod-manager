import { Button } from "@deadlock-mods/ui/components/button";
import {
  ArrowClockwiseIcon,
  CheckIcon,
  HardDrivesIcon,
  MinusIcon,
} from "@phosphor-icons/react";
import { type ReactNode, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { usePerfStatus } from "@/hooks/performance/use-perf-queries";
import type { ImportSource } from "@/types/generated/ImportSource";

const Row = ({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) => (
  <li className='flex items-start gap-3'>
    <span className='mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted'>
      {icon}
    </span>
    <span className='flex min-w-0 flex-col gap-0.5'>
      <span className='font-medium text-sm'>{title}</span>
      <span className='text-muted-foreground text-xs leading-relaxed'>
        {description}
      </span>
    </span>
  </li>
);

/** Name of the config whose lines the live-file import leaves out, if one is in the file. */
export const useAppliedConfigName = () => {
  const { data: status } = usePerfStatus();
  return status?.applied ? (status.desired?.request.name ?? null) : null;
};

type CurrentGameinfoSourceProps = {
  isAnalyzing: boolean;
  onAnalyze: (source: ImportSource) => void;
};

/** Reads the live file as soon as the tab opens; there is nothing to fill in first. */
export const CurrentGameinfoSource = ({
  isAnalyzing,
  onAnalyze,
}: CurrentGameinfoSourceProps) => {
  const { t } = useTranslation();
  const appliedName = useAppliedConfigName();
  const readOnMount = useRef(false);

  useEffect(() => {
    if (readOnMount.current) return;
    readOnMount.current = true;
    onAnalyze({ kind: "currentGameinfo" });
  }, [onAnalyze]);

  return (
    <div className='flex flex-col gap-4 rounded-lg border bg-card/40 p-4'>
      <div className='flex items-center gap-3'>
        <span className='flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary'>
          <HardDrivesIcon className='size-5' />
        </span>
        <div className='flex min-w-0 flex-col'>
          <span className='font-medium text-sm'>
            {t("performance.import.current.title")}
          </span>
          <span className='truncate font-mono text-muted-foreground text-xs'>
            game/citadel/gameinfo.gi
          </span>
        </div>
      </div>

      <p className='text-muted-foreground text-sm leading-relaxed'>
        {t("performance.import.current.description")}
      </p>

      <ul className='flex flex-col gap-3'>
        <Row
          description={t("performance.import.current.keptDescription")}
          icon={<CheckIcon className='size-3 text-emerald-500' weight='bold' />}
          title={t("performance.import.current.kept")}
        />
        <Row
          description={
            appliedName
              ? t("performance.import.current.leftOutApplied", {
                  name: appliedName,
                })
              : t("performance.import.current.leftOutNone")
          }
          icon={
            <MinusIcon className='size-3 text-muted-foreground' weight='bold' />
          }
          title={t("performance.import.current.leftOut")}
        />
      </ul>

      <Button
        className='self-start'
        icon={<ArrowClockwiseIcon />}
        isLoading={isAnalyzing}
        onClick={() => onAnalyze({ kind: "currentGameinfo" })}
        size='sm'
        variant='outline'>
        {t("performance.import.current.readAgain")}
      </Button>
    </div>
  );
};
