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
  <Card
    className={cn("stats-surface flex h-full flex-col shadow-none", className)}>
    <CardHeader className='flex flex-row items-start justify-between gap-4 space-y-0 pb-2'>
      <div className='min-w-0'>
        <CardTitle className='text-base'>{title}</CardTitle>
        {description && (
          <CardDescription className='text-xs'>{description}</CardDescription>
        )}
      </div>
      {action}
    </CardHeader>
    <CardContent className='min-h-0 flex-1'>{children}</CardContent>
  </Card>
);
