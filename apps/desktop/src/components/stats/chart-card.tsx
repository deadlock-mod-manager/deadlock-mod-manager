import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ChartCardProps {
  title: string;
  description?: string;
  /** Rendered on the right of the header - a legend, a picker, a hint. */
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

export const ChartCard = ({
  title,
  description,
  action,
  className,
  children,
}: ChartCardProps) => (
  <Card className={cn("shadow-none", className)}>
    <CardHeader className='flex flex-row items-start justify-between gap-4 space-y-0 pb-2'>
      <div className='min-w-0'>
        <CardTitle className='text-base'>{title}</CardTitle>
        {description && (
          <CardDescription className='text-xs'>{description}</CardDescription>
        )}
      </div>
      {action}
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
);

/** Legend key: a coloured mark beside text ink, never coloured text. */
export const LegendKey = ({
  color,
  label,
}: {
  color: string;
  label: string;
}) => (
  <span className='flex items-center gap-1.5 text-muted-foreground text-xs'>
    <span
      className='h-0.5 w-3 rounded-full'
      style={{ backgroundColor: color }}
    />
    {label}
  </span>
);
