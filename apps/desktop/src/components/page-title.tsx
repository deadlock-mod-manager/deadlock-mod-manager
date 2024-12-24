import { cn } from '@/lib/utils';

const PageTitle = ({ title, action, className }: { title: string; action?: React.ReactNode; className?: string }) => {
  return (
    <div className={cn('flex flex-col justify-center', className)}>
      <div className="flex gap-4 items-center">
        <h3 className="text-2xl font-bold">{title}</h3>
        {action ?? null}
      </div>
    </div>
  );
};

export default PageTitle;
