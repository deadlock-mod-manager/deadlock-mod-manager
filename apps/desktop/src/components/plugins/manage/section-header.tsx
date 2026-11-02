export const SectionHeader = ({
  label,
  count,
}: {
  label: string;
  count: number;
}) => (
  <div className='flex w-full shrink-0 items-center gap-[8px] px-[2px] pt-[6px]'>
    <span className='font-bold text-muted-foreground/75 text-[10px] uppercase leading-[normal] tracking-[1.1px]'>
      {label}
    </span>
    <span className='font-bold font-mono text-muted-foreground/75 text-[10px] leading-[normal]'>
      {count}
    </span>
  </div>
);
