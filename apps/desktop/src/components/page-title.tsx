import { cn } from '@/lib/utils';

const PageTitle = ({
  title,
  action,
  subtitle,
  className
}: {
  title: string;
  action?: React.ReactNode;
  subtitle?: string;
  className?: string;
}) => {
  return (
    <div className={cn('flex flex-col justify-center', className)}>
      <div className="flex gap-4 items-center">
        <h3 className="text-3xl font-bold">{title}</h3>
        {action ?? null}
      </div>
      {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
    </div>
  );
};

export default PageTitle;
