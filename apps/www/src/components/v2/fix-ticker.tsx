import { BugIcon } from "@phosphor-icons/react";

const FixList = ({ fixes, hidden }: { fixes: string[]; hidden?: boolean }) => (
  <ul aria-hidden={hidden} className='flex flex-col'>
    {fixes.map((fix) => (
      <li
        key={fix}
        className='flex gap-3 border-border border-b py-3 text-[15px] text-foreground-soft leading-snug'>
        <BugIcon
          aria-hidden='true'
          weight='bold'
          className='mt-0.5 size-4 shrink-0 text-online'
        />
        {fix}
      </li>
    ))}
  </ul>
);

export const FixTicker = ({ fixes }: { fixes: string[] }) => (
  <div className='h-[360px] overflow-hidden [mask-image:linear-gradient(transparent,black_15%,black_85%,transparent)] motion-reduce:overflow-y-auto'>
    <div className='animate-ticker-up hover:[animation-play-state:paused]'>
      <FixList fixes={fixes} />
      <div className='motion-reduce:hidden'>
        <FixList fixes={fixes} hidden />
      </div>
    </div>
  </div>
);
