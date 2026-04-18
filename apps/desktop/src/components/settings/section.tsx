import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { cn } from "@/lib/utils";

const Section = ({
  title,
  description,
  children,
  className,
  innerClassName,
  action,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
  action?: React.ReactNode;
}) => {
  return (
    <section
      className={cn(
        "flex flex-col rounded-lg border border-border/50 bg-card/50 p-5",
        className,
      )}>
      <div className='flex w-full flex-row items-start justify-between gap-4 border-b border-border/30 pb-3'>
        <div className='flex min-w-0 flex-col gap-1'>
          <h3 className='font-semibold text-foreground text-lg leading-tight'>
            {title}
          </h3>
          {description && (
            <div className='flex-wrap text-muted-foreground text-sm'>
              {description}
            </div>
          )}
        </div>
        {action && <div className='shrink-0'>{action}</div>}
      </div>
      <div className={cn("mt-4", innerClassName)}>{children}</div>
    </section>
  );
};

export const SectionSkeleton = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <Section
      description={<Skeleton className='h-4 w-96' />}
      innerClassName='flex flex-col gap-4'
      title={<Skeleton className='h-6 w-48' />}>
      {children}
    </Section>
  );
};

export default Section;
