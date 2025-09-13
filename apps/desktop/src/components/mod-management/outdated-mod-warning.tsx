import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type OutdatedModWarningProps = {
  variant?: 'indicator' | 'alert';
  className?: string;
};

export const OutdatedModWarning = ({
  variant = 'indicator',
  className,
}: OutdatedModWarningProps) => {
  const warningText =
    "This mod hasn't been updated since August 19, 2025 and may not work properly";

  if (variant === 'alert') {
    return (
      <Alert className={className} variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{warningText}</AlertDescription>
      </Alert>
    );
  }

  // Indicator variant for cards
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge className={`cursor-help ${className}`} variant="destructive">
          <AlertTriangle className="mr-1 h-3 w-3" />
          Outdated
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p className="max-w-xs">{warningText}</p>
      </TooltipContent>
    </Tooltip>
  );
};
