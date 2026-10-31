export const ActionRow = ({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) => (
  <div className='flex items-center gap-4'>
    <div className='min-w-0 flex-1'>
      <p className='font-medium text-foreground/90 text-sm'>{label}</p>
      <p className='text-muted-foreground text-xs leading-relaxed'>
        {description}
      </p>
    </div>
    {children}
  </div>
);
