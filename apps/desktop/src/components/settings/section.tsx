import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
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
    <div className={cn("flex flex-col py-4", className)}>
      <div className='flex w-full flex-row items-center justify-between'>
        <div className='flex flex-col gap-1'>
          <h3 className='font-semibold text-primary/10 text-xl'>{title}</h3>
          {description && (
            <div className='flex-wrap text-muted-foreground text-sm'>
              {description}
            </div>
          )}
        </div>
        {action && <div className='mt-2 flex flex-col'>{action}</div>}
      </div>
      <Separator className='mt-2' />
      <div className={cn("mt-4", innerClassName)}>{children}</div>
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
      className='gap-2'
      description={<Skeleton className='h-4 w-96' />}
      innerClassName='flex flex-col gap-4'
      title={<Skeleton className='h-6 w-48' />}>
      {children}
    </Section>
  );
};

export default Section;
