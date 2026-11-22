import { Button } from "@deadlock-mods/ui/components/button";
import { ArrowsClockwiseIcon, WarningIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { useBisect } from "@/hooks/use-bisect";

/**
 * Shown instead of the normal banner when a session can't continue: it was
 * saved by an older version, or the banner itself failed. Putting the mods
 * back only needs what every session has saved since the first version.
 */
export const BisectRecoveryBanner = ({
  reason,
}: {
  reason: "outdated" | "error";
}) => {
  const { t } = useTranslation();
  const { run, isPending } = useBisect();
  return (
    <div
      className='relative z-20 flex shrink-0 items-center gap-3 border-primary/15 border-b bg-secondary py-1.5 pr-1.5 pl-4'
      role='alert'>
      <WarningIcon
        aria-hidden
        className='size-[18px] shrink-0 text-primary'
        weight='fill'
      />
      <p className='min-w-0 flex-1 truncate text-[13px] leading-7'>
        <span className='font-semibold text-foreground'>
          {t("bisect.banner.title")}
        </span>{" "}
        <span className='text-foreground/70'>
          {t(`bisect.recovery.${reason}`)}
        </span>
      </p>
      <div className='flex shrink-0 items-center gap-1'>
        <Button
          className='h-7 px-2.5 text-xs'
          disabled={isPending}
          onClick={() => run({ type: "stop" })}
          size='sm'>
          <ArrowsClockwiseIcon className='size-3.5' weight='bold' />
          {t("bisect.recovery.restore")}
        </Button>
        <Button
          className='h-7 px-2.5 text-xs'
          disabled={isPending}
          onClick={() => run({ type: "discard" })}
          size='sm'
          variant='ghost'>
          {t("bisect.recovery.forget")}
        </Button>
      </div>
    </div>
  );
};
