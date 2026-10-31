import { cn } from "@deadlock-mods/ui/lib/utils";

export const Section = ({
  title,
  description,
  action,
  flat = false,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  /** Drops the panel chrome when the content is already made of cards. */
  flat?: boolean;
  children: React.ReactNode;
}) => (
  <section
    className={cn(
      "flex flex-col",
      !flat && "rounded-lg border border-border/50 bg-card/50 p-5",
    )}>
    <div className='flex items-start justify-between gap-4 border-border/30 border-b pb-3'>
      <div className='flex min-w-0 flex-col gap-1'>
        <h4 className='font-semibold text-lg leading-tight'>{title}</h4>
        {description && (
          <p className='text-muted-foreground text-sm'>{description}</p>
        )}
      </div>
      {action && <div className='shrink-0'>{action}</div>}
    </div>
    <div className='mt-4 flex flex-col gap-4'>{children}</div>
  </section>
);
