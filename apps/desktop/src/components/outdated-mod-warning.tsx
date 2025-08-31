import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';
import { Badge } from './ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

interface OutdatedModWarningProps {
  variant?: 'indicator' | 'alert';
  className?: string;
}

export const OutdatedModWarning = ({ variant = 'indicator', className }: OutdatedModWarningProps) => {
  const warningText = "This mod hasn't been updated since August 19, 2025 and may not work properly";

  if (variant === 'alert') {
    return (
      <Alert variant="destructive" className={className}>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{warningText}</AlertDescription>
      </Alert>
    );
  }

  // Indicator variant for cards
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="destructive" className={`cursor-help ${className}`}>
          <AlertTriangle className="h-3 w-3 mr-1" />
          Outdated
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p className="max-w-xs">{warningText}</p>
      </TooltipContent>
    </Tooltip>
  );
};
