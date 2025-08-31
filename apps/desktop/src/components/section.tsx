import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { Skeleton } from './ui/skeleton';

const Section = ({
  title,
  description,
  children,
  className,
  innerClassName,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
}) => {
  return (
    <div className={cn('flex flex-col py-4', className)}>
      <h3 className="font-semibold text-primary/10 text-xl">{title}</h3>
      {description && (
        <div className="text-muted-foreground text-sm">{description}</div>
      )}
      <Separator className="mt-2" />
      <div className={cn('mt-4', innerClassName)}>{children}</div>
    </div>
  );
};

export const SectionSkeleton = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <Section
      className="gap-2"
      description={<Skeleton className="h-4 w-96" />}
      innerClassName="flex flex-col gap-4"
      title={<Skeleton className="h-6 w-48" />}
    >
      {children}
    </Section>
  );
};

export default Section;
