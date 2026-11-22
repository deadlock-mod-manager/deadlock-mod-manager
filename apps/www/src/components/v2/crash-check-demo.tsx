import { cn } from "@deadlock-mods/ui/lib/utils";
import {
  ArrowsClockwiseIcon,
  CheckCircleIcon,
  CheckIcon,
  type Icon,
  LightbulbIcon,
  LightningSlashIcon,
  PackageIcon,
  PlayIcon,
  SlidersHorizontalIcon,
} from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

const Row = ({
  icon: RowIcon,
  title,
  meta,
  action,
}: {
  icon: Icon;
  title: string;
  meta: string;
  action?: ReactNode;
}) => (
  <li className='flex min-h-14 items-center gap-3 rounded-md border border-border bg-background/40 px-3 py-2.5'>
    <RowIcon weight='duotone' className='size-4 shrink-0 text-primary' />
    <span className='min-w-0 flex-1'>
      <span className='block font-medium text-sm'>{title}</span>
      <span className='block text-muted-foreground text-xs'>{meta}</span>
    </span>
    {action}
  </li>
);

/**
 * The desktop app's "Did Deadlock just crash?" dialog, with the same change
 * rows. Disable both works the way it does in the app.
 */
export const CrashCheckDemo = () => {
  const { t } = useTranslation("v2");
  const [disabled, setDisabled] = useState(false);

  return (
    <div className='rounded-xl border border-border-strong bg-surface p-5 shadow-[0_30px_80px_rgba(0,0,0,0.35)]'>
      <div className='flex items-start gap-4'>
        <span className='flex size-10 shrink-0 items-center justify-center rounded-md bg-destructive/15'>
          <LightningSlashIcon
            weight='duotone'
            className='size-5 text-destructive'
          />
        </span>
        <div>
          <p className='font-semibold'>{t("demo.crash.title")}</p>
          <p className='mt-1 text-muted-foreground text-sm leading-relaxed'>
            {t("demo.crash.body")}
          </p>
        </div>
      </div>

      <p className='mt-5 font-semibold text-muted-foreground text-xs uppercase tracking-wide'>
        {t("demo.crash.changesHeading")}
      </p>
      <ul className='mt-2 space-y-2'>
        <Row
          icon={PackageIcon}
          title={t("demo.crash.modsAdded")}
          meta={t("demo.crash.modsAddedWhen")}
          action={
            disabled ? (
              <span className='flex h-8 shrink-0 items-center gap-1 text-muted-foreground text-xs'>
                <CheckIcon weight='bold' className='size-3.5' />
                {t("demo.crash.disabled")}
              </span>
            ) : (
              <button
                type='button'
                onClick={() => setDisabled(true)}
                className='h-8 shrink-0 rounded-md border border-border-hover px-3 font-medium text-xs hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 active:translate-y-px'>
                {t("demo.crash.disableBoth")}
              </button>
            )
          }
        />
        <Row
          icon={ArrowsClockwiseIcon}
          title={t("demo.crash.modUpdated")}
          meta={t("demo.crash.modUpdatedWhen")}
        />
        <Row
          icon={SlidersHorizontalIcon}
          title={t("demo.crash.launchOptions")}
          meta={t("demo.crash.launchOptionsAdded")}
        />
      </ul>

      <p className='mt-4 flex items-start gap-2 text-muted-foreground text-xs leading-relaxed'>
        <LightbulbIcon weight='duotone' className='mt-px size-4 shrink-0' />
        {t("demo.crash.tip")}
      </p>

      <div
        aria-hidden='true'
        className='mt-4 flex flex-wrap items-center justify-end gap-2 border-border border-t pt-4'>
        <span className='inline-flex h-8 items-center rounded-md px-3 font-medium text-muted-foreground text-xs'>
          {t("demo.crash.closedIt")}
        </span>
        <span
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 font-semibold text-primary-foreground text-xs transition-shadow duration-500",
            disabled &&
              "shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-primary)_25%,transparent)]",
          )}>
          <PlayIcon weight='fill' className='size-3.5' />
          {t("demo.crash.launchAgain")}
        </span>
      </div>

      <p role='status' className='mt-3 flex h-4 items-center text-xs'>
        {disabled ? (
          <span className='flex animate-dl-rise items-center gap-1.5 text-foreground'>
            <CheckCircleIcon weight='fill' className='size-4 text-online' />
            {t("demo.crash.modsDisabled")}
          </span>
        ) : (
          <span className='text-muted-foreground'>{t("demo.crash.hint")}</span>
        )}
      </p>
    </div>
  );
};
