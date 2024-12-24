import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { Skeleton } from './ui/skeleton';

const Section = ({
  title,
  description,
  children,
  className,
  innerClassName
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
}) => {
  return (
    <div className={cn('flex flex-col py-4', className)}>
      <h3 className="text-xl font-semibold text-primary/10">{title}</h3>
      {description && <div className="text-sm text-muted-foreground">{description}</div>}
      <Separator className="mt-2" />
      <div className={cn('mt-4', innerClassName)}>{children}</div>
    </div>
  );
};

export const SectionSkeleton = ({ children }: { children: React.ReactNode }) => {
  return (
    <Section
      className="gap-2"
      title={<Skeleton className="w-48 h-6" />}
      description={<Skeleton className="w-96 h-4" />}
      innerClassName="flex flex-col gap-4"
    >
      {children}
    </Section>
  );
};

export default Section;
