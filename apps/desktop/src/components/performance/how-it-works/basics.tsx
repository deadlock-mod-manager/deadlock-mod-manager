import {
  ArrowCounterClockwiseIcon,
  ArrowsClockwiseIcon,
  FileTextIcon,
  MonitorIcon,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

/** The four facts most people need, before any detail. */
const BASICS = [
  { id: "inPlace", icon: FileTextIcon },
  { id: "turnOff", icon: ArrowCounterClockwiseIcon },
  { id: "updates", icon: ArrowsClockwiseIcon },
  { id: "video", icon: MonitorIcon },
] as const;

export const Basics = () => {
  const { t } = useTranslation();
  return (
    <section
      aria-label={t("performance.howItWorks.basics.label")}
      className='grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-4'>
      {BASICS.map(({ id, icon: Icon }) => (
        <div className='flex flex-col gap-2 bg-card p-5' key={id}>
          <Icon aria-hidden className='size-5 text-primary' />
          <p className='font-medium text-sm'>
            {t(`performance.howItWorks.basics.${id}.title`)}
          </p>
          <p className='text-muted-foreground text-sm leading-relaxed'>
            {t(`performance.howItWorks.basics.${id}.body`)}
          </p>
        </div>
      ))}
    </section>
  );
};
