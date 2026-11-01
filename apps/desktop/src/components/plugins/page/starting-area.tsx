import { CircleNotchIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

const SkeletonBar = ({ className }: { className: string }) => (
  <span className={`block rounded-[6px] bg-[#1E1A18] ${className}`} />
);

const SKELETON_CARD =
  "flex w-full flex-col gap-3 rounded-[12px] bg-card p-5 ring-1 ring-border ring-inset";

/** Shown over the frame until the plugin's page says it is ready. */
export const StartingArea = () => {
  const { t } = useTranslation();
  return (
    <div
      aria-busy
      className='flex min-h-0 flex-1 flex-col gap-[14px] overflow-hidden p-6'>
      <div className={`${SKELETON_CARD} animate-pulse`}>
        <SkeletonBar className='h-3.5 w-[140px]' />
        <SkeletonBar className='h-2.5 w-full' />
        <div className='flex gap-6'>
          <SkeletonBar className='h-7 w-[90px]' />
          <SkeletonBar className='h-7 w-[70px]' />
          <SkeletonBar className='h-7 w-[90px]' />
        </div>
        <SkeletonBar className='h-[34px] w-[180px]' />
      </div>
      <div className={`${SKELETON_CARD} animate-pulse`}>
        <SkeletonBar className='h-3.5 w-[120px]' />
        <SkeletonBar className='h-2.5 w-full' />
        <SkeletonBar className='h-2.5 w-full' />
      </div>
      <p className='flex items-center gap-2 text-[12px] text-muted-foreground leading-[normal]'>
        <CircleNotchIcon className='animate-spin' size={13} />
        {t("plugins.page.starting.hint")}
      </p>
    </div>
  );
};
