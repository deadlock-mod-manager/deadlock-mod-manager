import { cn } from "@deadlock-mods/ui/lib/utils";
import { Info } from "lucide-react";

interface EducationalCalloutProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function EducationalCallout({
  title,
  children,
  className,
}: EducationalCalloutProps) {
  return (
    <div
      className={cn(
        "mb-6 rounded-lg border border-blue-500/20 bg-blue-500/5 p-4",
        className,
      )}>
      <div className='mb-2 flex items-center gap-2 font-medium text-blue-400 text-sm'>
        <Info className='h-4 w-4' />
        {title}
      </div>
      <div className='text-muted-foreground text-sm leading-relaxed'>
        {children}
      </div>
    </div>
  );
}
