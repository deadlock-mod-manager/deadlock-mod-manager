export const SectionLabel = ({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
}) => (
  <div className='flex items-center gap-1.5'>
    <h3 className='font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.08em]'>
      {children}
    </h3>
    {right && <span className='ml-auto'>{right}</span>}
  </div>
);
