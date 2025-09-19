import { cn } from "@/lib/utils";

const PageTitle = ({
  title,
  action,
  subtitle,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  subtitle?: string;
  className?: string;
}) => {
  return (
    <div className={cn("flex flex-col justify-center", className)}>
      <div className='flex items-center gap-4'>
        <h3 className='font-bold text-3xl'>{title}</h3>
        {action ?? null}
      </div>
      {subtitle && <p className='text-muted-foreground'>{subtitle}</p>}
    </div>
  );
};

export default PageTitle;
